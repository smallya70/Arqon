/* Importer and zip-reader regression. No network, no external tools. */
import { readZip } from "./zip.js";
import { readRegister } from "./import.js";
import { runAll } from "./checks.js";
import { writeFileSync, rmSync } from "node:fs";

let fail = 0;
const t = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   " + d)); if (!c) fail++; };

console.log("\nzip reader, no external unzip");
const z = readZip("./ownership-register-v4.2.xlsx");
t("reads the central directory", z.names().length > 5, String(z.names().length));
t("finds the workbook", z.has("xl/workbook.xml"));
t("inflates a sheet", (z.text("xl/worksheets/sheet1.xml") || "").includes("<row"));
t("returns null for a missing entry", z.text("xl/nope.xml") === null);

console.log("\nrejects what it cannot read");
writeFileSync("/tmp/not-a-zip.xlsx", "this is not a zip");
let msg = "";
try { readRegister("/tmp/not-a-zip.xlsx"); } catch (e) { msg = e.message; }
t("a non-zip file is refused with a reason", /not a zip archive/.test(msg), msg.slice(0, 70));
rmSync("/tmp/not-a-zip.xlsx", { force: true });

console.log("\nshapes it was not written for");
const cases = [
  ["ownership-register-v4.2.xlsx", 26, 1, "Group Structure", 6],
  ["variant-a-flat-header.xlsx",    5, 1, "Sheet1",          1],
  ["variant-b-multisheet.xlsx",     6, 2, "EMEA",            3],
  ["variant-c-decimals.xlsx",       5, 1, "Ownership",       2],
];
for (const [file, rowCount, sheetCount, firstSheet, headerRow] of cases) {
  const { rows, report } = readRegister(file, { version: "v1" });
  const used = report.sheets.filter(s => s.used);
  t(`${file}: ${rowCount} rows`, rows.length === rowCount, String(rows.length));
  t(`${file}: ${sheetCount} sheet(s) used`, used.length === sheetCount, String(used.length));
  t(`${file}: header found at row ${headerRow}`, used[0].headerRow === headerRow, String(used[0]?.headerRow));
  t(`${file}: real sheet name kept`, used[0].name === firstSheet, used[0]?.name);
}

console.log("\nvalue handling");
const { rows: c } = readRegister("variant-c-decimals.xlsx", { version: "v1" });
t("decimal 1.0 becomes 100%", c.find(r => r.code === "C002").pct === 100);
t("decimal 0.6 becomes 60%",  c.find(r => r.code === "C003").pct === 60);
t("excel date serial becomes ISO",
  /^\d{4}-\d{2}-\d{2}$/.test(c.find(r => r.code === "C002").from),
  c.find(r => r.code === "C002").from);

console.log("\nsheets that are not registers");
const { report: r } = readRegister("ownership-register-v4.2.xlsx", { version: "v1" });
const skipped = r.sheets.find(s => !s.used);
t("a non-register sheet is skipped", !!skipped, JSON.stringify(r.sheets.map(s => s.name)));
t("and the reason is stated", /required column/.test(skipped.why || ""), skipped?.why);

console.log("\nfinding classes");
const { rows: n } = readRegister("ownership-register-v4.2.xlsx", { version: "v4.2" });
const f = runAll(n);
t("every finding is classed", f.every(x => x.class === "defect" || x.class === "question"));
t("every finding carries evidence", f.every(x => x.evidence.length > 0));
t("evidence cites sheet, row and version",
  f.every(x => x.evidence.every(e => e.sheet && e.row && e.version)));
t("5 defects", f.filter(x => x.class === "defect").length === 5,
  String(f.filter(x => x.class === "defect").length));
t("6 questions", f.filter(x => x.class === "question").length === 6,
  String(f.filter(x => x.class === "question").length));

console.log("\n" + (fail ? fail + " FAILED" : "ALL PASS"));
process.exit(fail ? 1 : 0);
