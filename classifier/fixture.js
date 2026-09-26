/* Adapts the W049 annotation reference into candidate shape for evaluation.

   The pack is explicit that this JSON is an annotation fixture, not a payload
   that may be loaded as production records. So the adapter deliberately drops
   the adjudicated states rather than carrying them across: annotationReview
   becomes "candidate" and businessApproval stays "not_evidenced". A record that
   Codex adjudicated is still not a record anyone approved. */

import { readFileSync } from "node:fs";
import { canonicalType } from "./contract.js";
import { structure } from "./core.js";

export function loadReference(path) {
  const r = JSON.parse(readFileSync(path, "utf8"));
  const doc = structure(r.source.rawText, {
    filename: r.source.document?.filename || "raw_transcript.txt",
    workshop: "W049",
  });
  doc.sourceSha256 = r.source.sourceSha256;
  return { raw: r, transcript: doc };
}

export function toCandidates(r, { as = "evaluation" } = {}) {
  return {
    schema: "arqon.candidates/2",
    policy: r.annotationPolicy.id,
    provenance: {
      model: `reference/${r.reviewer}`,
      promptVersion: "n/a-reference",
      policyVersion: r.annotationPolicy.id,
      generatedAt: r.reviewDate,
      source: {
        filename: r.source.document?.filename || "raw_transcript.txt",
        sha256: r.source.sourceSha256,
        fingerprint: r.records[0]?.evidence[0]?.ref?.split("/")[0] ?? null,
      },
      note: `Adapted from ${r.schema} (${r.fixtureId}) for ${as}. Adjudicated states are ` +
            `not carried across: annotation review is not approval.`,
    },
    candidates: r.records.map(rec => ({
      id: rec.id,
      kind: rec.kind,
      requirementType: rec.requirementType ?? undefined,
      requirementTypeCanonical: rec.requirementType ? canonicalType(rec.requirementType) : undefined,
      statement: rec.statement,
      recordOrigin: rec.recordOrigin,
      evidence: rec.evidence.map(e => ({ ref: e.ref, passageId: e.passageId, quote: e.quote })),
      owner: rec.owner ?? null,
      routingSuggestion: rec.routingSuggestion ?? null,
      programmePriority: rec.programmePriority ?? null,
      statedPriority: rec.statedPriority ?? null,
      globalLocal: rec.globalLocal ?? null,
      entityMentions: rec.entityMentions ?? [],
      dueDate: rec.dueDate ?? null,
      dueCondition: rec.dueCondition ?? null,
      relationships: (rec.relationships ?? []).map(x => ({
        ...x, origin: x.origin === "reviewer_analysis" ? "reviewer_analysis" : x.origin })),
      missingFields: rec.missingFields ?? [],
      uncertainties: rec.uncertainties ?? [],
      /* Deliberately reset — see the note above. */
      evidenceStatus: "Reported",
      annotationReview: "candidate",
      businessApproval: "not_evidenced",
    })),
  };
}
