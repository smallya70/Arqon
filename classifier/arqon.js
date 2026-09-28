#!/usr/bin/env node
/* Local CLI. Four verbs, no network, no credentials.

     prepare   <transcript.txt|reference.json> --out prompt.txt [--workshop W-049]
     ingest    <response.json> --transcript <same source> [--model "..."] 
     evaluate  <set-id|response.json> --reference <W049-reference.json> --transcript <src>
     list

   The provider is separable: `prepare` writes a prompt, `ingest` reads a saved
   response. An API adapter later implements the same two steps and everything
   downstream is unchanged. */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { structure } from "./core.js";
import { buildPrompt, PROMPT_VERSION } from "./prompt.js";
import * as manual from "./providers/manual.js";
import { validate } from "./validate.js";
import { save, list, load } from "./store.js";
import { shortlist, worksheet, confirm } from "./evaluate.js";
import { recordSent, recordReply, recordResolution, list as outbox, historyFor } from "./outbox.js";
import { sha256 } from "./manifest.js";
import { POLICY } from "./contract.js";

const args = process.argv.slice(2);
const verb = args[0];
const flag = (name, dflt = null) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};
const die = (msg) => { console.error("\n" + msg + "\n"); process.exit(1); };

/* A source may be a raw transcript or the reference pack, which embeds one. */
function readSource(path) {
  if (!existsSync(path)) die(`No such file: ${path}`);
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const j = JSON.parse(text);
    const raw = j.source?.rawText;
    if (!raw) die(`${path} has no source.rawText.`);
    const doc = structure(raw, { filename: j.source.document?.filename || path,
                                 workshop: flag("workshop", "") });
    doc.sourceSha256 = j.source.sourceSha256 ?? sha256(Buffer.from(raw));
    return doc;
  }
  const doc = structure(text, { filename: path, workshop: flag("workshop", "") });
  doc.sourceSha256 = sha256(Buffer.from(text));
  return doc;
}

if (verb === "prepare") {
  const doc = readSource(args[1] ?? die("Usage: prepare <source> --out prompt.txt"));
  const out = flag("out", "prompt.txt");
  const prompt = buildPrompt(doc, { workshop: flag("workshop", "") });
  const r = manual.prepare(prompt, out);
  console.log(`\ndocument     ${doc.source.fingerprint}  sha256 ${doc.sourceSha256.slice(0, 16)}…`);
  console.log(`passages     ${doc.passages.length}`);
  console.log(`prompt       ${r.path}  (${r.bytes} bytes, ${PROMPT_VERSION}, ${POLICY})`);
  console.log(`\nRun it, save the JSON reply, then:\n  node arqon.js ingest <reply.json> --transcript ${args[1]}\n`);

} else if (verb === "ingest") {
  const respPath = args[1] ?? die("Usage: ingest <response.json> --transcript <source>");
  const srcPath = flag("transcript") ?? die("--transcript is required: output is validated against it.");
  const doc = readSource(srcPath);
  let output;
  try { output = manual.ingest(respPath); } catch (e) { die(e.message); }

  /* Fill provenance the adapter can attest to; do not invent what it cannot. */
  output.provenance = {
    ...(output.provenance ?? {}),
    promptVersion: output.provenance?.promptVersion ?? PROMPT_VERSION,
    policyVersion: output.provenance?.policyVersion ?? POLICY,
    generatedAt: output.provenance?.generatedAt ?? new Date().toISOString(),
    ...manual.provenance({ model: flag("model", "unknown (manual)") }),
    model: flag("model", output.provenance?.model ?? "unknown (manual)"),
    source: { filename: srcPath, fingerprint: doc.source.fingerprint, sha256: doc.sourceSha256 },
  };

  const v = validate(output, doc);
  console.log(`\ncandidates   ${output.candidates?.length ?? 0}`);
  console.log(`accepted     ${v.accepted.length}`);
  console.log(`rejected     ${v.rejected.length}`);
  if (v.errors.length) {
    console.log(`\nvalidation failures (${v.errors.length})`);
    for (const e of v.errors)
      console.log(`  ${e.code.padEnd(20)} ${(e.candidate ?? "(document)").padEnd(10)} ${e.detail}`);
  } else console.log("\nno validation failures");

  if (!v.accepted.length) {
    console.log("\nNothing saved: no candidate passed the gate.\n");
    process.exit(2);
  }
  const saved = save(output, {
    validation: v,
    source: { filename: srcPath, fingerprint: doc.source.fingerprint,
              sha256: doc.sourceSha256, workshop: flag("workshop", "") },
    provider: manual.provenance({ model: flag("model", "unknown (manual)") }),
  });
  console.log(`\nsaved        ${saved.path}`);
  console.log(`state        awaiting_review — nothing is approved and nothing was notified\n`);

} else if (verb === "evaluate") {
  const refPath = flag("reference") ?? die("--reference <W049-reference.json> is required.");
  const reference = JSON.parse(readFileSync(refPath, "utf8"));
  const target = args[1] ?? die("Usage: evaluate <set-id|response.json> --reference <ref>");
  let candidates;
  if (existsSync(target) && target.endsWith(".json")) {
    const j = JSON.parse(readFileSync(target, "utf8"));
    candidates = j.candidates ? j : { candidates: j.accepted ?? [] };
  } else candidates = { candidates: load(target).accepted };

  const s = shortlist(candidates, reference);

  /* With a marked worksheet, report final counts. Without one, produce the
     worksheet and refuse to report coverage. */
  const marked = flag("confirmed");
  if (marked) {
    const c = confirm(s, readFileSync(marked, "utf8"));
    console.log(`\nCAPTURE against ${c.basis.reference}`);
    for (const [k, v] of Object.entries(c.counts)) console.log(`  ${k.padEnd(42)} ${v}`);
    if (c.missed.length) {
      console.log(`\n  obligations not captured:`);
      c.missed.forEach(m => console.log(`    ${m.obligation} (${m.kind}) — ${m.why}`));
    }
    if (c.unchecked.length) console.log(`\n  unmarked: ${c.unchecked.join(", ")}`);
    console.log(`\n  ${c.note}`);
    console.log(`  ${c.basis.note}`);
    if (c.basis.kindsAbsentFromReference.length)
      console.log(`  Absent from the reference entirely: ${c.basis.kindsAbsentFromReference.join(", ")}.\n`);
  } else {
    const out = flag("worksheet", "capture-check.md");
    writeFileSync(out, worksheet(s));
    console.log(`\nSHORTLIST against ${s.basis.reference}`);
    console.log(`  reference obligations  ${s.basis.referenceObligations}`);
    console.log(`  candidates             ${s.basis.candidates}\n`);
    for (const [k, v] of Object.entries(s.countable)) console.log(`  ${k.padEnd(50)} ${v}`);
    const none = s.rows.filter(r => r.noCandidateCitesTheEvidence);
    if (none.length) {
      console.log(`\n  no candidate cites the evidence for:`);
      none.forEach(r => console.log(`    ${r.obligation} (${r.kind}) ${r.statement.slice(0, 66)}`));
    }
    if (s.outside.length) {
      console.log(`\n  candidates citing passages the reference does not use:`);
      s.outside.forEach(c => console.log(`    ${c.id} (${c.kind}) ${c.statement.slice(0, 62)}`));
    }
    if (s.unsupported.length) {
      console.log(`\n  unsupported fields:`);
      s.unsupported.forEach(u => console.log(`    ${u.candidate} ${u.field} = ${u.value}`));
    }
    console.log(`\n  worksheet  ${out}`);
    console.log(`  Coverage is NOT reported. Passage overlap is a shortlist; mark the worksheet`);
    console.log(`  by hand, then:  node arqon.js evaluate ${target} --reference ${refPath} --confirmed ${out}\n`);
    console.log(`  ${s.basis.note}`);
    if (s.basis.kindsAbsentFromReference.length)
      console.log(`  Absent from the reference entirely: ${s.basis.kindsAbsentFromReference.join(", ")}.\n`);
  }

} else if (verb === "sent") {
  /* Log a message a person sent. The tool did not send it and says so. */
  const body = flag("body") ? readFileSync(flag("body"), "utf8") : null;
  const m = recordSent({
    to: (flag("to") ?? die("--to is required")).split(",").map(s => s.trim()),
    subject: flag("subject"),
    body,
    recordIds: (flag("records") ?? die("--records IC-001,Q-002 is required"))
                 .split(",").map(s => s.trim()),
    sentBy: flag("by") ?? die("--by is required: who sent it"),
    programme: flag("programme", null),
  });
  console.log(`\nlogged       ${m.id}`);
  console.log(`to           ${m.to.join(", ")}`);
  console.log(`records      ${m.recordIds.join(", ")}`);
  console.log(`attestation  ${m.attestation}\n`);

} else if (verb === "reply") {
  const m = recordReply(args[1] ?? die("Usage: reply <message-id> --from ... --text ..."), {
    from: flag("from") ?? die("--from is required"),
    text: flag("text") ?? (flag("file") ? readFileSync(flag("file"), "utf8")
                                        : die("--text or --file is required")),
  });
  const r = m.replies[m.replies.length - 1];
  console.log(`\nlogged       ${r.id}  from ${r.from}`);
  console.log(`\nA reply is evidence, not an answer. Record a resolution when someone with`);
  console.log(`authority over the subject decides:`);
  console.log(`  node arqon.js resolve ${m.id} --record <id> --decision answered \\`);
  console.log(`    --by "<name>" --authority "<why they may decide this>"\n`);

} else if (verb === "resolve") {
  const m = recordResolution(args[1] ?? die("Usage: resolve <message-id> --record ... --decision ..."), {
    recordId: flag("record") ?? die("--record is required"),
    decision: flag("decision") ?? die("--decision answered|not_answered|superseded|withdrawn"),
    by: flag("by") ?? die("--by is required"),
    authorityBasis: flag("authority") ?? die("--authority is required: why this person may decide it"),
    note: flag("note", ""),
  });
  const r = m.resolutions[m.resolutions.length - 1];
  console.log(`\n${r.recordId}  ${r.decision}  by ${r.by}`);
  console.log(`authority    ${r.authorityBasis}\n`);

} else if (verb === "history") {
  const h = historyFor(args[1] ?? die("Usage: history <record-id>"));
  console.log(`\n${h.recordId}  —  ${h.state}\n`);
  if (!h.asked.length) console.log("  never asked\n");
  for (const a of h.asked)
    console.log(`  asked      ${a.sentAt}  ${a.to.join(", ")}  (${a.message}, ${a.channel})`);
  for (const r of h.replies)
    console.log(`  reply      ${r.receivedAt}  ${r.from}\n               ${r.text.slice(0, 90)}`);
  for (const r of h.resolutions)
    console.log(`  resolved   ${r.at}  ${r.decision}  by ${r.by} — ${r.authorityBasis}`);
  if (h.replies.length && !h.resolutions.length)
    console.log(`\n  A reply is recorded but nobody has resolved this. It remains open.`);
  console.log("");

} else if (verb === "outbox") {
  const all = outbox();
  if (!all.length) { console.log("\nNothing logged.\n"); process.exit(0); }
  console.log("");
  for (const m of all)
    console.log(`  ${m.id}  ${m.sentAt.slice(0,16)}  ${m.to.join(",")}\n` +
                `    records ${m.recordIds.join(", ")} · replies ${m.replies.length} · ` +
                `resolutions ${m.resolutions.length}`);
  console.log("");

} else if (verb === "list") {
  const sets = list();
  if (!sets.length) { console.log("\nNo candidate sets saved.\n"); process.exit(0); }
  console.log("");
  for (const s of sets)
    console.log(`  ${s.id}\n    ${s.savedAt}  ${s.state}  accepted ${s.accepted}  rejected ${s.rejected}`);
  console.log("");

} else {
  console.log(`
ARQON local extraction CLI — no network, no credentials.

  node arqon.js prepare  <source> --out prompt.txt [--workshop W-049]
  node arqon.js ingest   <response.json> --transcript <source> [--model "..."]
  node arqon.js evaluate <set-id|response.json> --reference <reference.json>
                         [--worksheet capture-check.md] [--confirmed capture-check.md]
  node arqon.js list

<source> is a transcript .txt, or a reference pack JSON carrying source.rawText.
Saved sets are awaiting_review. Nothing here approves a record or sends anything.
`);
}
