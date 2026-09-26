/* Import an ownership register from a workbook of unknown shape.

   No external tools: a spreadsheet is a zip of XML and Node reads both natively
   (see zip.js), so this runs unchanged on Windows, macOS and Linux.

   A client's register will not look like the one this was written against.
   So nothing is assumed: sheets are discovered, the header row is found by
   scoring candidate rows against known column meanings, and columns are
   matched by label synonym rather than position.

   The importer reports what it mapped and what it could not. A silent guess
   is worse than a refusal — an unmapped ownership column means every finding
   downstream is wrong in a way nobody would notice. */

import { readZip } from "./zip.js";

/* Column meanings and the labels seen in the wild. Order matters only in that
   the first matching synonym wins for a given cell. */
const FIELDS = {
  code:       ["entity code","code","entity ref","entity id","company code","legal entity code","sap code","id"],
  name:       ["legal entity name","entity name","company name","entity","name","legal name","company"],
  country:    ["country","ctry","dom","domicile","jurisdiction","country of incorporation"],
  parentCode: ["parent code","parent ref","holding co code","immediate parent code","parent entity code","parent id"],
  parentName: ["parent name","parent","holding company","immediate parent","parent entity","direct parent"],
  pct:        ["ownership %","ownership","shareholding","holding %","%","percentage","interest","equity %","ownership percentage"],
  from:       ["effective from","valid from","from","start date","effective date","acquired","from date"],
  to:         ["effective to","valid to","to","end date","disposed","to date"],
  method:     ["consolidation method","method","treatment","consolidation","basis"],
  notes:      ["notes","comment","comments","remarks"],
};

/* Without these the register cannot be checked at all. */
const REQUIRED = ["name", "pct", "parentCode"];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z%]/g, "");
const SYN = {};
for (const [field, labels] of Object.entries(FIELDS))
  for (const l of labels) SYN[norm(l)] = SYN[norm(l)] || field;

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serialToDate = (n) => new Date(EXCEL_EPOCH + n * 86400000).toISOString().slice(0, 10);

function sharedStrings(zip) {
  const xml = zip.text("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));
}

/* Sheet name → worksheet file, in workbook order. */
function sheetIndex(zip) {
  const wb = zip.text("xl/workbook.xml");
  const rels = zip.text("xl/_rels/workbook.xml.rels") || "";
  if (!wb) throw new Error("No xl/workbook.xml — this does not look like a spreadsheet.");
  /* Attribute order varies between writers, so parse each tag's attributes
     rather than assuming a sequence. */
  const attrs = (tag) => Object.fromEntries(
    [...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) target[a.Id] = a.Target.replace(/^.*worksheets\//, "");
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const rid = a["r:id"] || a["id"];
    if (a.name && rid && target[rid]) out.push({ name: decode(a.name), file: target[rid] });
  }
  if (!out.length) // some writers omit the relationship ids; fall back to entry order
    zip.names().filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
      .forEach((n, i) => out.push({ name: `Sheet${i + 1}`, file: n.split("/").pop() }));
  return out;
}

function readSheet(zip, file, strings) {
  const xml = zip.text("xl/worksheets/" + file);
  if (!xml) return [];
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1], attrs = cm[2], inner = cm[3];
      if (/t="inlineStr"/.test(attrs)) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        if (t) cells[col] = decode(t[1]);
        continue;
      }
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (!v) continue;
      if (/t="s"/.test(attrs)) cells[col] = strings[Number(v[1])];
      else cells[col] = { num: Number(v[1]), styled: /s="\d+"/.test(attrs) };
    }
    rows.push({ rowNum: Number(rm[1]), cells });
  }
  return rows;
}

/* Score each of the first 15 rows on how many cells look like column labels.
   The header is the best-scoring row, provided it maps the required fields. */
function findHeader(rows) {
  let best = null;
  for (const r of rows.slice(0, 15)) {
    const map = {};
    for (const [col, raw] of Object.entries(r.cells)) {
      const field = SYN[norm(typeof raw === "object" ? "" : raw)];
      if (field && !map[field]) map[field] = col;
    }
    const score = Object.keys(map).length;
    if (!best || score > best.score) best = { rowNum: r.rowNum, map, score };
  }
  return best;
}

/* Values arrive as strings, numbers, or numbers that are really dates.
   Percentages arrive as 60 or as 0.6; both are common and mean the same. */
function cellValue(raw, field) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    const s = String(raw).trim();
    if (!s) return null;
    if (field === "pct") {
      const n = Number(s.replace("%", ""));
      if (!Number.isNaN(n)) return n > 0 && n <= 1 ? n * 100 : n;
    }
    return s;
  }
  const { num, styled } = raw;
  if (field === "from" || field === "to")
    return num > 20000 && num < 80000 ? serialToDate(num) : String(num);
  if (field === "pct") return num > 0 && num <= 1 ? num * 100 : num;
  if (styled && num > 20000 && num < 80000) return serialToDate(num);
  return num;
}

export function readRegister(xlsxPath, { version = "unknown", sheets } = {}) {
  let zip;
  try { zip = readZip(xlsxPath); }
  catch (e) { throw new Error(`Could not open ${xlsxPath}: ${e.message}`); }
  const strings = sharedStrings(zip);
  const all = sheetIndex(zip);
  const wanted = sheets ? all.filter(s => sheets.includes(s.name)) : all;

  const rows = [], report = { file: xlsxPath, version, sheets: [] };

  for (const sheet of wanted) {
    const raw = readSheet(zip, sheet.file, strings);
    const hdr = findHeader(raw);
    const mapped = hdr ? Object.keys(hdr.map) : [];
    const missing = REQUIRED.filter(f => !mapped.includes(f));

    if (!hdr || missing.length) {
      report.sheets.push({
        name: sheet.name, used: false, headerRow: hdr?.rowNum ?? null,
        mapped, missing,
        why: !hdr ? "no row resembled a header"
             : `required column(s) not found: ${missing.join(", ")}`,
      });
      continue;
    }

    const body = raw.filter(r => r.rowNum > hdr.rowNum)
      .map(r => {
        const rec = { sheet: sheet.name, row: r.rowNum, version };
        for (const [field, col] of Object.entries(hdr.map))
          rec[field] = cellValue(r.cells[col], field);
        return rec;
      })
      .filter(r => r.name);

    rows.push(...body);
    report.sheets.push({
      name: sheet.name, used: true, headerRow: hdr.rowNum, rows: body.length,
      mapped, unmapped: Object.keys(FIELDS).filter(f => !mapped.includes(f)),
    });
  }

  if (!rows.length)
    throw new Error(
      `No sheet in ${xlsxPath} looked like an ownership register.\n` +
      report.sheets.map(s => `  ${s.name}: ${s.why || "no rows"}`).join("\n") +
      `\nRequired columns: ${REQUIRED.join(", ")}. Add or rename them and try again.`);

  return { rows, report };
}
