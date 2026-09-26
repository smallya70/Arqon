#!/usr/bin/env node
/* Import a register, run the checks, print findings with their evidence.
   Usage: node run.js <register.xlsx> [version] */
import { readRegister } from "./import.js";
import { runAll } from "./checks.js";

const [file, version = "unknown"] = process.argv.slice(2);
if (!file) { console.error("Usage: node run.js <register.xlsx> [version]"); process.exit(1); }

const rows = readRegister(file, { version });
const findings = runAll(rows);

const SEV = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.code.localeCompare(b.code));

console.log(`\n${rows.length} ownership rows read from ${file} (version ${version})`);
console.log(`${findings.length} findings\n`);

let last = null;
for (const f of findings) {
  if (f.code !== last) { console.log("─".repeat(78)); last = f.code; }
  console.log(`${f.code}  [${f.severity}]  ${f.entity}`);
  console.log(`   ${f.message}`);
  for (const e of f.evidence.slice(0, 4))
    console.log(`   evidence: ${e.sheet} row ${e.row} — "${e.name}"` +
                `${e.pct != null ? ` · ${e.pct}%` : ""}${e.from ? ` · from ${e.from}` : ""}` +
                ` · ${e.version}`);
  if (f.evidence.length > 4) console.log(`   evidence: +${f.evidence.length - 4} more rows`);
  console.log(`   → ${f.remedy}\n`);
}

const byCode = {};
findings.forEach(f => byCode[f.code] = (byCode[f.code] || 0) + 1);
console.log("─".repeat(78));
console.log("Summary:", Object.entries(byCode).map(([c, n]) => `${c}×${n}`).join("  "));
