/* Reads the register out of the workbook, preserving evidence per row.

   No npm dependency: xlsx files are zip archives of XML, and the two sheets we
   need are a shared-string table and a worksheet. Enough of the format is
   implemented here to read a flat table; anything richer should use a library. */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function unzip(xlsxPath) {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  execFileSync("unzip", ["-o", "-q", xlsxPath, "-d", dir]);
  return dir;
}

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function sharedStrings(dir) {
  let xml;
  try { xml = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8"); }
  catch { return []; }
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serialToDate = (n) =>
  new Date(EXCEL_EPOCH + n * 86400000).toISOString().slice(0, 10);

function sheetRows(dir, sheetFile, strings) {
  const xml = readFileSync(join(dir, "xl/worksheets/" + sheetFile), "utf8");
  const out = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(rm[1]);
    const cells = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1], attrs = cm[2], inner = cm[3];
      if (/t="inlineStr"/.test(attrs)) {          // written by openpyxl and others
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        if (t) cells[col] = decode(t[1]);
        continue;
      }
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (!v) continue;
      if (/t="s"/.test(attrs)) cells[col] = strings[Number(v[1])];
      else {
        const num = Number(v[1]);
        cells[col] = /s="(\d+)"/.test(attrs) && num > 40000 && num < 60000
          ? serialToDate(num) : num;
      }
    }
    out.push({ rowNum, cells });
  }
  return out;
}

export function readRegister(xlsxPath, { sheetFile = "sheet1.xml", headerRow = 6,
                                         sheetName = "Group Structure",
                                         version = "unknown" } = {}) {
  const dir = unzip(xlsxPath);
  const strings = sharedStrings(dir);
  const raw = sheetRows(dir, sheetFile, strings);
  const header = raw.find(r => r.rowNum === headerRow);
  if (!header) throw new Error(`No header at row ${headerRow} of ${sheetName}`);

  const colOf = {};
  for (const [col, label] of Object.entries(header.cells)) {
    const k = String(label).toLowerCase().replace(/[^a-z]/g, "");
    colOf[k] = col;
  }
  const need = ["entitycode","legalentityname","parentcode","ownership"];
  const missing = need.filter(n => !colOf[n]);
  if (missing.length) throw new Error(`Header does not look like an ownership register: ${missing}`);

  const get = (cells, ...names) => {
    for (const n of names) { const c = colOf[n]; if (c && cells[c] !== undefined) return cells[c]; }
    return null;
  };

  return raw.filter(r => r.rowNum > headerRow)
    .map(r => ({
      sheet: sheetName, row: r.rowNum, version,
      code: get(r.cells, "entitycode"),
      name: get(r.cells, "legalentityname"),
      country: get(r.cells, "country"),
      parentCode: get(r.cells, "parentcode"),
      parentName: get(r.cells, "parentname"),
      pct: get(r.cells, "ownership"),
      from: get(r.cells, "effectivefrom"),
      to: get(r.cells, "effectiveto"),
      method: get(r.cells, "consolidationmethod"),
      notes: get(r.cells, "notes"),
    }))
    .filter(r => r.name);
}
