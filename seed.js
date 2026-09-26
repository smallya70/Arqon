#!/usr/bin/env node
/* Puts one role and two records into the register so you can watch a real draft
   land in your own Outlook before any client is involved.

   Usage: node seed.js <your-email> <tenant-guid> [config.json] */
import { readFileSync } from "node:fs";
import * as DB from "./db.js";

const [email, tenantId, cfgPath = "./config.json"] = process.argv.slice(2);
if (!email || !tenantId) {
  console.error("Usage: node seed.js <your-email> <tenant-guid> [config.json]");
  console.error("The tenant guid is printed by signin.js.");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const db = DB.open(cfg.dbPath);

db.prepare(`INSERT OR REPLACE INTO programme_role VALUES (?,?,?,?,?,1)`)
  .run("PRG-001", "Accounting policy lead", "Accounting policy lead", email, tenantId);

const now = new Date().toISOString();
const rows = [
  ["IC-001","PRG-001","W-042","Requirement","Control",
   "Reject intercompany submissions with no valid counterparty at the point of entry.",
   "Accounting policy lead","reviewer-added","Approved","Proposed",
   JSON.stringify(["priority","acceptance criteria"])],
  ["EX-001","PRG-001","W-042","Exception","Process",
   "Two Spanish entities submit intercompany manually until the 2027 close.",
   "Accounting policy lead","reviewer-added","Approved","Requested",
   JSON.stringify(["baseline rule"])],
];
for (const r of rows)
  db.prepare(`INSERT OR REPLACE INTO record VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...r, now);

const ev = [
  ["IC-001","P-007","Group controller","we need to stop submissions arriving with no counterparty at all"],
  ["EX-001","P-008","Regional finance lead, EMEA","still on their old ledger until the 2027 close"],
  ["EX-001","P-009","Accounting policy lead","it needs group sign-off, not a local arrangement"],
];
for (const e of ev)
  db.prepare(`INSERT OR REPLACE INTO record_evidence VALUES (?,?,?,?)`).run(...e);

db.close();
console.log(`Seeded PRG-001: role 'Accounting policy lead' -> ${email} (tenant ${tenantId})`);
console.log("Records IC-001 and EX-001, with evidence.\n");
console.log("Now ask Claude, with the server connected:");
console.log(`  "what's pending for the accounting policy lead on PRG-001?"`);
console.log(`  "draft an approval request for those records"`);
