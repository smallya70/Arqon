/* The classifier's output contract, aligned to arqon.working-review-policy/1
   as adjudicated in the W049 review.

   Four distinctions the review insisted on, each of which a naive schema
   collapses:

   1. A programme priority and a personally qualified "must" are different
      evidence. A-012's speaker said Must; nobody agreed it. Both are stored,
      neither becomes the other.
   2. A reported role is not a resolved person. The Group controller volunteered
      to ask legal; that is a role on a follow-up, not an identified owner.
   3. A due date is a calendar date. "Before we commit" is a condition, and
      putting it in a date field invents a deadline.
   4. Reviewer-generated content — clarifications, relationships, proposed
      acceptance criteria — must not read as something a participant said.

   Everything absent stays absent and is named as absent. */

export const SCHEMA = "arqon.candidates/2";
export const POLICY = "arqon.working-review-policy/1";

export const KINDS = ["Requirement", "Decision", "Assumption", "Open question",
                      "Issue", "Risk", "Exception", "Action"];

/* The 14-category union agreed in D3. */
export const REQUIREMENT_TYPES = ["Functional", "Data", "Integration", "Reporting",
  "Workflow", "Security", "Control and audit", "Performance", "Regulatory",
  "Migration", "Operational support", "Training", "Scalability", "Operating model"];

/* D3: Control maps to Control and audit; Security stays distinct, and an
   obligation that prevents something does not imply an access-control
   mechanism. */
export const TYPE_ALIASES = { "Control": "Control and audit", "Audit/control": "Control and audit" };
export const canonicalType = (t) => TYPE_ALIASES[t] ?? t;

/* Where a record came from. Only explicit_statement belongs in the extracted
   workshop set; the rest are reviewer output and are kept separately (D6). */
export const RECORD_ORIGINS = ["explicit_statement", "explicit_request",
  "derived_from_explicit_uncertainty",   // the room expressed the doubt; the question follows
  "reviewer_clarification", "reviewer_context"];
export const EXTRACTED_ORIGINS = ["explicit_statement", "explicit_request",
                                  "derived_from_explicit_uncertainty"];

/* Three states, never merged. Annotation adjudication is not approval (D11). */
export const EVIDENCE_STATUS   = ["Reported"];              // classifier may claim only this
export const ANNOTATION_REVIEW = ["candidate"];             // never adjudicated_by_*
export const BUSINESS_APPROVAL = ["not_evidenced"];         // never Approved

export const FIELD_ORIGINS = ["extracted", "absent"];       // reviewer_* comes later
export const RELATION_ORIGINS = ["source_statement", "reviewer_analysis"];
export const PROPOSAL_TYPES = ["clarification", "recommendation", "acceptance_criteria"];

/* D2/D4: fields a kind needs before sign-off. A classifier reports which are
   absent; it never supplies them. */
export const REQUIRED_FIELDS = {
  Requirement:     ["owner", "programmePriority", "acceptanceCriteria", "globalLocal"],
  Decision:        ["authority"],
  Assumption:      ["owner", "validationDate", "consequenceIfFalse"],
  "Open question": ["owner"],
  Issue:           ["owner", "impact"],
  Risk:            ["owner", "consequence"],
  Exception:       ["approver", "baselineRule", "endDate"],
  Action:          ["owner", "dueDate"],
};

export const REQUIRED_PROVENANCE = ["model", "promptVersion", "policyVersion",
                                    "generatedAt", "source"];

export const ERR = {
  SCHEMA: "E-SCHEMA", SHAPE: "E-SHAPE", PROVENANCE: "E-PROVENANCE",
  KIND: "E-KIND", TYPE: "E-TYPE",
  NO_EVIDENCE: "E-NO-EVIDENCE", BARE_PASSAGE: "E-BARE-PASSAGE",
  REF_UNRESOLVED: "E-REF-UNRESOLVED", REF_FOREIGN: "E-REF-FOREIGN",
  QUOTE_NOT_FOUND: "E-QUOTE",
  INVENTED_FIELD: "E-INVENTED", MISSING_NOT_NAMED: "E-MISSING",
  STATUS_OVERREACH: "E-STATUS",
  APPROVAL_FROM_ANNOTATION: "E-APPROVAL",   // adjudication turned into approval
  PRIORITY_CONFLATED: "E-PRIORITY",         // a stated must became a programme priority
  ROLE_AS_PERSON: "E-ROLE",                 // a reported role became a resolved owner
  CONDITION_AS_DATE: "E-DATE",              // "before we commit" put in a date field
  ENTITY_UNRESOLVED: "E-ENTITY",            // a country name claimed as a legal entity
  AUTHORITY_FROM_UNCERTAIN: "E-AUTHORITY",
  REVIEWER_AS_SOURCE: "E-REVIEWER",         // reviewer content presented as a participant claim
  UNSUPPORTED_STATUS: "E-UNSUPPORTED",      // "corrected"/"resolved" with nothing establishing it
};

export const err = (code, detail, { candidate = null, path = null } = {}) =>
  ({ code, detail, candidate, path });
