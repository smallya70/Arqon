/* Outbox regression: the three events stay separate and nothing closes itself. */
import { recordSent, recordReply, recordResolution, historyFor, list } from "./outbox.js";
import { rmSync, readFileSync, readdirSync } from "node:fs";

process.env.ARQON_STORE = "/tmp/arqon-outbox-test";
rmSync(process.env.ARQON_STORE, { recursive: true, force: true });
let fail = 0;
const t = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   " + d)); if (!c) fail++; };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

console.log("\na message must be tied to records and a sender");
t("no recipient refused", throws(() => recordSent({ recordIds: ["A"], sentBy: "X" }), /to is required/));
t("no records refused", throws(() => recordSent({ to: "a@b", sentBy: "X" }), /recordIds is required/));
t("the reason is given", throws(() => recordSent({ to: "a@b", sentBy: "X" }),
  /cannot be found again when someone asks/));
t("no sender refused", throws(() => recordSent({ to: "a@b", recordIds: ["A"] }), /sentBy is required/));

const m = recordSent({ to: "shesh@diintl.com", subject: "s", body: "b",
  recordIds: ["Q-002", "IC-001"], sentBy: "S. Mallya" });

console.log("\nwhat the tool will and will not claim");
t("a manual send is recorded as a claim", /reported by the sender/.test(m.attestation));
t("and says it did not observe it", /did not send or observe/.test(m.attestation));
t("covers the records given", m.recordIds.join() === "Q-002,IC-001");

console.log("\nstate before anything comes back");
t("asked, no reply", historyFor("Q-002").state === "asked, no reply recorded");
t("a record never asked about says so", historyFor("ZZ-999").state === "never asked");

console.log("\na reply is evidence, not an answer");
t("empty reply refused", throws(() => recordReply(m.id, { from: "a@b" }), /text is required/));
t("the reason is given", throws(() => recordReply(m.id, { from: "a@b" }), /the reply itself is the evidence/));
recordReply(m.id, { from: "shesh@diintl.com", text: "Too many in one mail." });
t("state is replied, unresolved", historyFor("Q-002").state === "replied, unresolved");
t("the reply carries the caveat",
  /answers nothing until someone with authority/.test(historyFor("Q-002").replies[0].note));
t("a reply does not resolve the other record too",
  historyFor("IC-001").state === "replied, unresolved");

console.log("\nonly a resolution closes, and it names who and why");
t("no author refused",
  throws(() => recordResolution(m.id, { recordId: "Q-002", decision: "answered",
    authorityBasis: "x" }), /by is required/));
t("no authority basis refused",
  throws(() => recordResolution(m.id, { recordId: "Q-002", decision: "answered", by: "X" }),
    /authorityBasis is required/));
t("and explains why", throws(() => recordResolution(m.id,
  { recordId: "Q-002", decision: "answered", by: "X" }),
  /a reply from someone without it settles nothing/));
t("an unknown decision refused", throws(() => recordResolution(m.id,
  { recordId: "Q-002", decision: "closed", by: "X", authorityBasis: "y" }), /unknown decision/));
t("a record the message never covered refused", throws(() => recordResolution(m.id,
  { recordId: "ZZ-1", decision: "answered", by: "X", authorityBasis: "y" }), /was not covered/));

recordResolution(m.id, { recordId: "Q-002", decision: "not_answered", by: "S. Okonjo",
  authorityBasis: "accounting policy lead; treatment is their subject" });
t("resolved record shows its decision", historyFor("Q-002").state === "not_answered");
t("the other record stays unresolved", historyFor("IC-001").state === "replied, unresolved");
t("the resolution records its authority",
  /accounting policy lead/.test(historyFor("Q-002").resolutions[0].authorityBasis));

console.log("\nthe three events stay distinguishable on disk");
const raw = JSON.parse(readFileSync(
  `${process.env.ARQON_STORE}/outbox/${readdirSync(process.env.ARQON_STORE + "/outbox")[0]}`, "utf8"));
t("sent, replies and resolutions are separate arrays",
  Array.isArray(raw.replies) && Array.isArray(raw.resolutions) && !!raw.sentAt);
t("no state field the system could flip by itself", !("status" in raw) && !("closed" in raw));
t("nothing writes an approved state", !JSON.stringify(raw).includes('"Approved"'));

console.log("\n" + (fail ? fail + " FAILED" : "ALL PASS"));
rmSync(process.env.ARQON_STORE, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
