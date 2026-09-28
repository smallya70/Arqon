#!/usr/bin/env node
/* Local CLI. Four verbs, no network, no credentials.

     prepare   <transcript.txt|reference.json> --out prompt.txt [--workshop W-049]
     ingest    <response.json> --transcript <same source> [--model "..."] 
     evaluate  <set-id|response.json> --reference <W049-reference.json> --transcript <src>
     list

   The provider is separable: `prepare` writes a prompt, `ingest` reads a saved
   response. An API adapter later implements the same two steps and everything
   downstream is unchanged. */

import { readFileSync, existsSync } from "node:fs";
import { structure } from "./core.js";
import { buildPrompt, PROMPT_VERSION } from "./prompt.js";
import * as manual from "./providers/manual.js";
import { validate } from "./validate.js";
import { save, list, load } from "./store.js";
import { evaluate } from "./evaluate.js";
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
  } else {
    const set = load(target);
    candidates = { candidates: set.accepted };
  }
  const r = evaluate(candidates, reference);
  console.log(`\nCOVERAGE against ${r.basis.reference}`);
  console.log(`  reference records   ${r.basis.referenceRecords}`);
  console.log(`  candidates          ${r.basis.candidates}\n`);
  for (const [k, v] of Object.entries(r.counts))
    console.log(`  ${k.padEnd(30)} ${v}`);
  if (r.missed.length) {
    console.log(`\n  obligations nobody extracted:`);
    r.missed.forEach(m => console.log(`    ${m.id} (${m.kind}) ${m.statement.slice(0, 74)}`));
  }
  if (r.kindDisagreements.length) {
    console.log(`\n  kind disagreements:`);
    r.kindDisagreements.forEach(d =>
      console.log(`    ${d.reference} reference=${d.referenceKind} candidate=${d.candidateKinds.join("/")}`));
  }
  if (r.unsupported.length) {
    console.log(`\n  unsupported fields:`);
    r.unsupported.forEach(u => console.log(`    ${u.candidate} ${u.field} = ${u.value}`));
  }
  if (r.unmatched.length) {
    console.log(`\n  candidates citing passages the reference does not use:`);
    r.unmatched.forEach(u => console.log(`    ${u.id} (${u.kind}) ${u.statement.slice(0, 66)}`));
  }
  console.log(`\n  ${r.basis.note}`);
  if (r.basis.kindsAbsentFromReference.length)
    console.log(`  Absent from the reference entirely: ${r.basis.kindsAbsentFromReference.join(", ")}.` +
                ` Nothing here measures those kinds.\n`);

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
  node arqon.js list

<source> is a transcript .txt, or a reference pack JSON carrying source.rawText.
Saved sets are awaiting_review. Nothing here approves a record or sends anything.
`);
}
