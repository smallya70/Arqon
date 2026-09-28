/* Builds the extraction prompt from the importer document and the working
   policy. It carries the transcript, the rules and the output shape — and
   nothing else. The reference answers are never included: a prompt that
   contains the expected records measures obedience, not extraction. */

import { KINDS, REQUIREMENT_TYPES, TYPE_ALIASES, REQUIRED_FIELDS, SCHEMA, POLICY }
  from "./contract.js";

export const PROMPT_VERSION = "extract/1";

export function buildPrompt(doc, { programmeContext = {}, workshop = "" } = {}) {
  const passages = doc.passages.map(p => {
    const who = p.parse === "unparsed" ? "(unparsed line)"
      : p.speaker.certainty === "confirmed" ? p.speaker.designation
      : `${p.speaker.raw} [speaker ${p.speaker.certainty}]`;
    return `${p.ref}  ${p.time ? "[" + p.time + "] " : ""}${who}: ${p.text}`;
  }).join("\n");

  return `You are extracting structured records from a financial consolidation
workshop transcript. You propose candidates. You do not review, approve or
verify anything — those are separate acts by named people.

POLICY: ${POLICY}
OUTPUT SCHEMA: ${SCHEMA}

RECORD KINDS
${KINDS.join(", ")}

REQUIREMENT TYPES (use exactly these; "Control" and "Audit/control" are aliases
of "Control and audit", which is the canonical form)
${REQUIREMENT_TYPES.join(", ")}

WHAT A RECORD IS
A record is what the programme must now do, has now settled, or must now
resolve. Most of a transcript produces no records. Context, war stories,
restating the agenda and thinking aloud are discarded. A statement of current
difficulty is evidence for a requirement, not a requirement.

THE RULES THAT MATTER MOST

1. Evidence must support the whole statement, not just its subject. Cite every
   passage needed. A quote establishing that a problem exists does not support a
   requirement stating how it is solved.

2. Never supply what nobody said. If the session did not give an owner, a
   priority, a date, a threshold or an entity id, leave it null and name it in
   missingFields. An invented value is worse than a gap, because nobody sees it.

3. A programme priority is not a stated "must". An obligation phrased with
   "must" does not set a priority. If someone states a priority and qualifies it
   ("for me, yes"), record it in statedPriority with its qualifier and source
   refs, and leave programmePriority null.

4. A reported role is not a resolved person. If someone volunteers by role,
   record owner.reportedRole with the passage. Never fill owner.resolvedPerson
   unless a passage names the person.

5. A condition is not a date. "Before we commit" goes in dueCondition. dueDate
   takes a calendar date or nothing.

6. A country or a place name is not a legal entity. Record entityMentions with
   resolution "unresolved" and entityId null, and list resolvedEntityIds in
   missingFields.

7. An uncertain speaker cannot establish a decision. If the only passages
   supporting a settling statement have an unconfirmed speaker, it is an Open
   question, not a Decision.

8. Do not assert a settled state the transcript hedges. "We fixed it, I believe"
   does not establish that it was fixed. Record the question, or record the
   claim as reported with its uncertainty.

9. An exception is a temporary departure from a named baseline, by named
   entities, with an end date. A request for an exception route is a Workflow
   requirement, not an approved Exception.

10. Anything you propose rather than extract — a clarification, a suggested
    acceptance criterion, a relationship you inferred — goes in proposals or
    relationships with its origin declared. It must never read as something a
    participant said.

REQUIRED FIELDS BY KIND — supply from the transcript or list in missingFields
${Object.entries(REQUIRED_FIELDS).map(([k, v]) => `  ${k}: ${v.join(", ")}`).join("\n")}

OUTPUT
Return JSON only. No prose, no markdown fences.

{
  "schema": "${SCHEMA}",
  "policy": "${POLICY}",
  "candidates": [
    {
      "id": "C-001",
      "kind": "Requirement",
      "requirementType": "Functional",
      "requirementTypeCanonical": "Functional",
      "statement": "one imperative sentence, under 25 words",
      "recordOrigin": "explicit_statement | explicit_request | derived_from_explicit_uncertainty",
      "evidence": [{ "ref": "<fingerprint>/P-nnn", "passageId": "P-nnn", "quote": "exact words from that passage" }],
      "owner": { "reportedRole": null, "resolvedPerson": null, "ref": null },
      "routingSuggestion": { "role": "...", "basis": "..." },
      "programmePriority": null,
      "statedPriority": { "value": "Must", "qualifier": "For me yes", "sourceRefs": ["<fingerprint>/P-nnn"] },
      "globalLocal": null,
      "scopeText": null,
      "entityMentions": [{ "text": "Turkey", "entityId": null, "resolution": "unresolved", "sourceRef": "<fingerprint>/P-nnn" }],
      "dueDate": null,
      "dueCondition": null,
      "relationships": [{ "targetRecordId": "C-002", "relationship": "...", "origin": "reviewer_analysis" }],
      "missingFields": ["owner", "programmePriority"],
      "uncertainties": ["what remains unresolved and why"],
      "evidenceStatus": "Reported",
      "annotationReview": "candidate",
      "businessApproval": "not_evidenced"
    }
  ]
}

Use the passage refs exactly as given below — they are document-scoped and a
bare "P-009" is not usable. Omit optional properties rather than inventing them.

${workshop ? `WORKSHOP: ${workshop}\n` : ""}${
  Object.keys(programmeContext).length
    ? `PROGRAMME CONTEXT: ${JSON.stringify(programmeContext)}\n` : ""}
TRANSCRIPT (document ${doc.source.fingerprint}, ${doc.passages.length} passages)

${passages}
`;
}
