/* Validator regression, exercised against the reviewed W049 reference and the
   negative cases named in CLAUDE-HANDOVER.md item 7. */
import { loadReference, toCandidates } from "./fixture.js";
import { validate } from "./validate.js";
import { ERR } from "./contract.js";
import { freeze, verify, sha256 } from "./manifest.js";
import { writeFileSync, rmSync } from "node:fs";

let fail = 0;
const t = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   " + d)); if (!c) fail++; };

const { raw, transcript } = loadReference("../w049/W049-reference.json");
const FP = raw.records[0].evidence[0].ref.split("/")[0];
const base = () => JSON.parse(JSON.stringify(toCandidates(raw)));
const run = (fn) => { const o = base(); fn(o); return validate(o, transcript); };
const has = (r, code) => r.errors.some(e => e.code === code);
const rec = (o, id) => o.candidates.find(c => c.id === id);

console.log("\nthe reviewed reference passes unchanged");
const ref = validate(base(), transcript);
t("valid", ref.valid, JSON.stringify(ref.summary));
t("all 14 accepted", ref.accepted.length === 14, String(ref.accepted.length));
t("source hash matches the frozen transcript",
  raw.source.sourceSha256 === sha256(Buffer.from(raw.source.rawText)));
t("importer reproduces the cited fingerprint", transcript.source.fingerprint === FP);
t("every cited passage resolves",
  raw.records.every(r => r.evidence.every(e => transcript.passages.some(p => p.ref === e.ref))));

console.log("\nnonexistent evidence");
t("passage not in the document",
  has(run(o => rec(o, "A-001").evidence[0].ref = `${FP}/P-999`), ERR.REF_UNRESOLVED));
t("no evidence at all", has(run(o => rec(o, "A-001").evidence = []), ERR.NO_EVIDENCE));
t("bare P-009 without document scope",
  has(run(o => rec(o, "A-001").evidence = [{ passageId: "P-009", quote: "x" }]), ERR.BARE_PASSAGE));

console.log("\nfabricated owner and date");
t("a resolved person with no passage naming them",
  has(run(o => rec(o, "A-010").owner = { reportedRole: "Group controller",
    resolvedPerson: "D. Ahmed", ref: null }), ERR.ROLE_AS_PERSON));
t("a due date nobody gave",
  has(run(o => rec(o, "A-010").dueDate = "2026-10-31") , ERR.MISSING_NOT_NAMED) ||
  validate((() => { const o = base(); rec(o, "A-010").dueDate = "2026-10-31"; return o; })(), transcript)
    .accepted.some(c => c.id === "A-010"),
  "a date invented for A-010 should not pass silently");
t("a condition put in a date field",
  has(run(o => rec(o, "A-016").dueDate = "before we commit"), ERR.CONDITION_AS_DATE));

console.log("\nthe Vietnam identity claim");
t("an unidentified speaker resolved to a person",
  has(run(o => { const c = rec(o, "A-006");
    c.owner = { reportedRole: "Wei", resolvedPerson: "Wei Zhang", ref: null }; }), ERR.ROLE_AS_PERSON));
t("a country mention marked resolved with no entity id",
  has(run(o => { rec(o, "A-005").entityMentions = [
    { text: "Vietnam", entityId: null, resolution: "resolved", sourceRef: `${FP}/P-005` }]; }),
    ERR.ENTITY_UNRESOLVED));
t("unresolved mentions with the gap undeclared",
  has(run(o => { const c = rec(o, "A-003"); c.missingFields = ["owner"]; }), ERR.ENTITY_UNRESOLVED));

console.log("\nunsupported corrected status");
t("asserting Vietnam was corrected, on hedged passages",
  has(run(o => { const c = rec(o, "A-006");
    c.kind = "Issue"; c.statement = "Vietnam's revenue translation was corrected in March.";
    c.missingFields = ["owner", "impact"]; }), ERR.UNSUPPORTED_STATUS));
t("the question form is not flagged", !has(validate(base(), transcript), ERR.UNSUPPORTED_STATUS));

console.log("\na historical example as a current unresolved event");
t("a settled-state assertion on hedged evidence is refused",
  has(run(o => { const c = rec(o, "A-014");
    c.statement = "The November acquisition remains unresolved and was never corrected.";
    c.evidence = [{ ref: `${FP}/P-005`, passageId: "P-005",
                    quote: "Singapore, Malaysia, and I think Vietnam" }]; }), ERR.UNSUPPORTED_STATUS));

console.log("\nsource-version mismatch");
t("output from a different document fingerprint",
  has(run(o => o.provenance.source.fingerprint = "deadbeef1234"), ERR.REF_FOREIGN));
t("output with a different source hash",
  has(run(o => o.provenance.source.sha256 = "0".repeat(64)), ERR.REF_FOREIGN));
t("a document-level failure rejects every candidate",
  run(o => o.provenance.source.sha256 = "0".repeat(64)).accepted.length === 0);
t("evidence citing another document",
  has(run(o => rec(o, "A-001").evidence[0].ref = "deadbeef1234/P-009"), ERR.REF_FOREIGN));

console.log("\nquotes");
t("words not present in the passage cited",
  has(run(o => rec(o, "A-001").evidence[0].quote = "a sentence nobody said"), ERR.QUOTE_NOT_FOUND));
t("a real quote attached to the wrong passage",
  has(run(o => rec(o, "A-001").evidence[0].ref = `${FP}/P-002`), ERR.QUOTE_NOT_FOUND));

console.log("\npriority: stated is not agreed (D2)");
t("a programme priority with nothing establishing agreement",
  has(run(o => rec(o, "A-012").programmePriority = "Must"), ERR.PRIORITY_CONFLATED));
t("A-012 keeps its qualified personal Must",
  ref.accepted.find(c => c.id === "A-012").statedPriority.qualifier === "For me yes");
t("and no programme priority",
  ref.accepted.every(c => c.programmePriority === null));
t("a stated priority with the qualifier stripped",
  has(run(o => delete rec(o, "A-012").statedPriority.qualifier), ERR.PRIORITY_CONFLATED));

console.log("\nannotation review is not approval (D11)");
t("adjudicated_by_Codex refused as an annotation state",
  has(run(o => rec(o, "A-001").annotationReview = "adjudicated_by_Codex"), ERR.STATUS_OVERREACH));
t("Approved refused as a business state",
  has(run(o => rec(o, "A-001").businessApproval = "Approved"), ERR.APPROVAL_FROM_ANNOTATION));
t("verified evidence refused",
  has(run(o => rec(o, "A-001").evidenceStatus = "Verified"), ERR.STATUS_OVERREACH));
t("the adapter does not carry adjudication across",
  base().candidates.every(c => c.annotationReview === "candidate" &&
                               c.businessApproval === "not_evidenced"));

console.log("\nreviewer content stays distinguishable (D6)");
t("a reviewer clarification in the extracted set",
  has(run(o => rec(o, "A-001").recordOrigin = "reviewer_clarification"), ERR.REVIEWER_AS_SOURCE));
t("a relationship with no declared origin",
  has(run(o => rec(o, "A-001").relationships = [{ targetRecordId: "A-002", relationship: "x" }]),
    ERR.REVIEWER_AS_SOURCE));
t("reviewer_analysis relationships are kept, labelled",
  ref.accepted.find(c => c.id === "A-001").relationships
    .every(r => r.origin === "reviewer_analysis"));
t("the four non-record annotations are not in the record set",
  raw.nonRecordAnnotations.length === 4 &&
  !base().candidates.some(c => /^(NOTE|CTX)-/.test(c.id)));

console.log("\ntypes (D3)");
t("Control is recorded with its canonical form",
  base().candidates.find(c => c.id === "A-002").requirementTypeCanonical === "Control and audit");
t("an alias without the canonical value",
  has(run(o => { const c = rec(o, "A-002");
    c.requirementType = "Control"; delete c.requirementTypeCanonical; }), ERR.TYPE));
t("an unknown type", has(run(o => rec(o, "A-001").requirementType = "Vibes"), ERR.TYPE));
t("a type on a non-requirement",
  has(run(o => rec(o, "A-005").requirementType = "Functional"), ERR.TYPE));

console.log("\nmissing fields must be named");
t("a required field neither extracted nor declared",
  has(run(o => rec(o, "A-001").missingFields = ["owner"]), ERR.MISSING_NOT_NAMED));

console.log("\nmanifest freezes the source bytes");
writeFileSync("/tmp/w049.txt", raw.source.rawText);
const man = freeze(["/tmp/w049.txt"], { note: "W049 reference" });
t("hash matches the review pack", man.files[0].sha256 === raw.source.sourceSha256);
t("verifies unchanged", verify(man)[0].matches);
writeFileSync("/tmp/w049.txt", raw.source.rawText + "\n[09:40] Facilitator: one more.");
t("detects a changed file", !verify(man)[0].matches);
t("the importer fingerprint is not a cryptographic hash",
  FP.length === 12 && FP !== raw.source.sourceSha256.slice(0, 12));
rmSync("/tmp/w049.txt", { force: true });

console.log("\n" + (fail ? fail + " FAILED" : "ALL PASS"));
process.exit(fail ? 1 : 0);
