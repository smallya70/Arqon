/* CLI and pipeline regression. No network. */
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { loadReference, toCandidates } from "./fixture.js";
import { buildPrompt, PROMPT_VERSION } from "./prompt.js";
import { shortlist, worksheet, confirm } from "./evaluate.js";
import * as manual from "./providers/manual.js";

let fail = 0;
const t = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   " + d)); if (!c) fail++; };
const STORE = "/tmp/arqon-test-store";
rmSync(STORE, { recursive: true, force: true });
const cli = (args, ok = true) => {
  try {
    return execFileSync(process.execPath, ["arqon.js", ...args],
      { env: { ...process.env, ARQON_STORE: STORE }, encoding: "utf8" });
  } catch (e) { if (ok) throw e; return (e.stdout || "") + (e.stderr || ""); }
};

const { raw, transcript } = loadReference("../w049/W049-reference.json");

console.log("\nthe prompt carries the transcript and nothing from the reference");
const prompt = buildPrompt(transcript, { workshop: "W-049" });
t("all 32 passages included",
  (prompt.match(/1df000041775\/P-\d+/g) || []).length === 32);
t("no reference statement appears",
  raw.records.every(r => !prompt.includes(r.statement)));
t("no reference record id appears",
  raw.records.every(r => !prompt.includes(r.id)));
t("no mention of the reviewer or the fixture",
  !/Codex|adjudicat|W049-reference|annotation-reference/i.test(prompt));
t("the rules are stated", /programme priority is not a stated/i.test(prompt));
t("the output schema is stated", prompt.includes("arqon.candidates/2"));
t("speaker certainty is exposed", /speaker (uncertain|unresolved|conflict|reported)/.test(prompt));

console.log("\nthe manual adapter recovers JSON from an untidy reply");
writeFileSync("/tmp/fenced.json",
  'Here you go:\n```json\n{"schema":"arqon.candidates/2","candidates":[]}\n```\nHope that helps.');
t("fences and preamble stripped", manual.ingest("/tmp/fenced.json").schema === "arqon.candidates/2");
writeFileSync("/tmp/broken.json", "not json at all");
let threw = false;
try { manual.ingest("/tmp/broken.json"); } catch { threw = true; }
t("a reply with no JSON is refused", threw);
t("the adapter does not claim to know the model",
  /not observed/.test(manual.provenance().attestation));

console.log("\nprepare");
const out = cli(["prepare", "../w049/W049-reference.json", "--out", "/tmp/t-prompt.txt", "--workshop", "W-049"]);
t("reports the document fingerprint", out.includes("1df000041775"));
t("reports the source hash", out.includes("51e01c626cd8"));
t("writes the prompt", existsSync("/tmp/t-prompt.txt"));
t("names the prompt and policy versions",
  out.includes(PROMPT_VERSION) && out.includes("arqon.working-review-policy/1"));

console.log("\ningest rejects what the gate refuses");
const reply = { schema: "arqon.candidates/2", policy: "arqon.working-review-policy/1",
  candidates: [{ id: "X-1", kind: "Requirement", requirementType: "Functional",
    requirementTypeCanonical: "Functional", statement: "Do a thing.",
    recordOrigin: "explicit_statement",
    evidence: [{ ref: "1df000041775/P-999", passageId: "P-999", quote: "nope" }],
    missingFields: ["owner", "programmePriority", "acceptanceCriteria", "globalLocal"],
    evidenceStatus: "Reported", annotationReview: "candidate", businessApproval: "not_evidenced" }] };
writeFileSync("/tmp/t-bad.json", JSON.stringify(reply));
const badOut = cli(["ingest", "/tmp/t-bad.json", "--transcript", "../w049/W049-reference.json"], false);
t("the failure is named", badOut.includes("E-REF-UNRESOLVED"));
t("nothing is saved when nothing passes", badOut.includes("Nothing saved"));

console.log("\ningest saves the reference itself, awaiting review");
const asReply = toCandidates(raw);
delete asReply.provenance;                       // the CLI supplies what it can attest to
writeFileSync("/tmp/t-good.json", JSON.stringify(asReply));
const goodOut = cli(["ingest", "/tmp/t-good.json", "--transcript", "../w049/W049-reference.json",
                     "--workshop", "W-049", "--model", "test"]);
t("all 14 accepted", /accepted\s+14/.test(goodOut), goodOut.split("\n").slice(0,5).join(" | "));
t("state is awaiting_review", goodOut.includes("awaiting_review"));
t("nothing approved, nothing notified", /nothing is approved and nothing was notified/.test(goodOut));

const setId = readdirSync(STORE + "/candidate-sets")[0].replace(/\.json$/, "");
const stored = JSON.parse(readFileSync(`${STORE}/candidate-sets/${setId}.json`, "utf8"));
t("the store records the source hash", stored.source.sha256 === raw.source.sourceSha256);
t("the store records provider attestation", /not observed/.test(stored.provider.attestation));
t("the store has no approved state anywhere",
  !JSON.stringify(stored).includes('"Approved"'));
t("rejected candidates are kept, not dropped", Array.isArray(stored.rejected));

console.log("\npassage overlap is a shortlist, not coverage");
const s = shortlist({ candidates: stored.accepted }, raw);
t("no coverage figure is produced",
  !("obligationsCovered" in s.countable) && !("coverage" in s));
t("the note refuses an accuracy claim", /No accuracy figure is produced/.test(s.basis.note));
t("it says overlap is a shortlist", /shortlist, not coverage/.test(s.basis.note));
t("absent kinds are named",
  s.basis.kindsAbsentFromReference.join() === "Decision,Assumption,Risk,Exception");

/* A-001 and A-002 both rest on P-009, so each shortlists both candidates.
   That ambiguity is the reason this cannot be counted automatically. */
const a1 = s.rows.find(r => r.obligation === "A-001");
t("one obligation can shortlist several candidates", a1.shortlisted.length > 1,
  String(a1.shortlisted.length));
t("shared passages are shown for the check",
  a1.shortlisted.every(c => c.sharedPassages.length > 0));

const partial = shortlist({ candidates: stored.accepted.slice(0, 5) }, raw);
t("obligations with no candidate citing their evidence are countable",
  partial.countable.obligationsWithNoCandidateCitingTheirEvidence > 0);
t("the rest need a manual check",
  partial.countable.obligationsNeedingManualCheck > 0);

console.log("\nthe worksheet, and counts only after it is marked");
const ws = worksheet(s);
t("every shortlisted pair gets a line", ws.split("\n").filter(l => /^\| \? \|/.test(l)).length
  === s.rows.reduce((n, r) => n + r.shortlisted.length, 0));
t("obligations with nothing shortlisted are shown too", /\(none cite its evidence\)/.test(ws) ||
  s.rows.every(r => r.shortlisted.length));
t("it explains why this is manual", /Sharing a passage is not capturing an obligation/.test(ws));

const unmarked = confirm(s, ws);
t("an unmarked worksheet reports nothing captured", unmarked.counts.obligationsCaptured === 0);
t("and says the counts are incomplete", !unmarked.complete && /unmarked/.test(unmarked.note));

const allYes = confirm(s, ws.replace(/^\| \? \|/gm, "| y |"));
t("marking captures them", allYes.counts.obligationsCaptured > 0);
t("and completes", allYes.complete);
const allNo = confirm(s, ws.replace(/^\| \? \|/gm, "| n |"));
t("marking n counts them as missed",
  allNo.counts.obligationsMissed === raw.records.length, String(allNo.counts.obligationsMissed));
t("with the reason recorded",
  allNo.missed.every(m => /do not capture it|no candidate cites/.test(m.why)));

console.log("\n" + (fail ? fail + " FAILED" : "ALL PASS"));
rmSync(STORE, { recursive: true, force: true });
["/tmp/fenced.json","/tmp/broken.json","/tmp/t-bad.json","/tmp/t-good.json","/tmp/t-prompt.txt"]
  .forEach(f => rmSync(f, { force: true }));
process.exit(fail ? 1 : 0);
