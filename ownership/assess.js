#!/usr/bin/env node
/* Assess a register and write an HTML report.
   Usage: node assess.js <register.xlsx> [version] [client name] */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { readRegister } from "./import.js";
import { runAll } from "./checks.js";
import { renderReport } from "./report.js";

const [file, version = "unknown", client = ""] = process.argv.slice(2);
if (!file) { console.error("Usage: node assess.js <register.xlsx> [version] [client]"); process.exit(1); }

let imported;
try { imported = readRegister(file, { version }); }
catch (e) { console.error("\n" + e.message + "\n"); process.exit(2); }

const { rows, report } = imported;
const SEV = { high: 0, medium: 1, low: 2 };
const findings = runAll(rows).sort((a, b) =>
  SEV[a.severity] - SEV[b.severity] || a.code.localeCompare(b.code));

const out = basename(file).replace(/\.xlsx$/i, "") + "-assessment.html";
writeFileSync(out, renderReport({ rows, report, findings, client }));

const d = findings.filter(f => f.class === "defect").length;
console.log(`${rows.length} rows from ${report.sheets.filter(s => s.used).length} sheet(s)`);
report.sheets.forEach(s => console.log(`  ${s.name}: ${s.used
  ? `header row ${s.headerRow}, ${s.rows} rows` : `skipped — ${s.why}`}`));
console.log(`${d} inconsistencies, ${findings.length - d} items needing confirmation`);
console.log(`→ ${out}`);
