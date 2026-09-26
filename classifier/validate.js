/* Deterministic validation against the frozen transcript and the working policy.

   Establishes: well-formedness, that every citation resolves in the document
   supplied, that quoted words are present in the passage cited, that nothing
   absent has been invented, and that no human act — approval, verification,
   resolution of an identity — has been claimed by a machine.

   Does NOT establish that a citation SUPPORTS the claim made from it. A passage
   can exist, be quoted exactly, and still not entail the statement. That is
   semantic review and stays with a person. The review pack says the same thing;
   it is repeated here because it is the check most easily assumed. */

import { SCHEMA, POLICY, KINDS, REQUIREMENT_TYPES, TYPE_ALIASES, canonicalType,
         RECORD_ORIGINS, EXTRACTED_ORIGINS, EVIDENCE_STATUS, ANNOTATION_REVIEW,
         BUSINESS_APPROVAL, FIELD_ORIGINS, RELATION_ORIGINS, PROPOSAL_TYPES,
         REQUIRED_FIELDS, REQUIRED_PROVENANCE, ERR, err } from "./contract.js";

const norm = (s) => String(s ?? "").toLowerCase()
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/\s+/g, " ").trim();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Words that assert a state nothing in a transcript can establish. D9: "caught
   at review" proves neither correction nor an open error. */
const SETTLED_CLAIM = /\b(corrected|resolved|fixed|closed|remediated|confirmed)\b/i;

export function validate(output, transcript, { strictSettledClaims = true } = {}) {
  const errors = [];
  const E = (...a) => errors.push(err(...a));

  if (!isObj(output)) { E(ERR.SHAPE, "Output is not an object."); return report(output, errors); }
  if (output.schema !== SCHEMA)
    E(ERR.SCHEMA, `Expected schema "${SCHEMA}", got "${output.schema ?? "(none)"}".`);
  if (output.policy && output.policy !== POLICY)
    E(ERR.SCHEMA, `Policy "${output.policy}" is not "${POLICY}".`);

  const p = output.provenance;
  if (!isObj(p)) E(ERR.PROVENANCE, "No provenance. The result cannot be reproduced.");
  else {
    for (const k of REQUIRED_PROVENANCE)
      if (!p[k]) E(ERR.PROVENANCE, `provenance.${k} is missing.`, { path: `provenance.${k}` });
    if (isObj(p.source)) {
      if (!p.source.sha256)
        E(ERR.PROVENANCE, "provenance.source.sha256 is missing. The importer fingerprint " +
          "detects change; it does not prove integrity.");
      else if (transcript?.sourceSha256 && p.source.sha256 !== transcript.sourceSha256)
        E(ERR.REF_FOREIGN, `Source hash ${p.source.sha256.slice(0,12)}… does not match the ` +
          `document supplied (${transcript.sourceSha256.slice(0,12)}…).`);
      if (p.source.fingerprint && transcript?.source?.fingerprint &&
          p.source.fingerprint !== transcript.source.fingerprint)
        E(ERR.REF_FOREIGN, `Output was produced from document ${p.source.fingerprint}, ` +
          `validated against ${transcript.source.fingerprint}.`);
    } else E(ERR.PROVENANCE, "provenance.source is missing.");
  }

  if (!Array.isArray(output.candidates)) {
    E(ERR.SHAPE, "candidates must be an array."); return report(output, errors);
  }

  const byRef = new Map();
  for (const pg of transcript?.passages ?? []) if (pg.ref) byRef.set(pg.ref, pg);
  const docFp = transcript?.source?.fingerprint ?? null;

  for (const c of output.candidates)
    validateCandidate(c, { byRef, docFp, E, strictSettledClaims });

  return report(output, errors);
}

function validateCandidate(c, { byRef, docFp, E, strictSettledClaims }) {
  const at = (path) => ({ candidate: c?.id ?? null, path });
  if (!isObj(c)) { E(ERR.SHAPE, "Candidate is not an object."); return; }
  if (!c.id) E(ERR.SHAPE, "Candidate has no id.", at("id"));
  if (!c.statement) E(ERR.SHAPE, "Candidate has no statement.", at("statement"));
  if (!KINDS.includes(c.kind)) E(ERR.KIND, `Unknown kind "${c.kind}".`, at("kind"));

  /* ---- record origin: reviewer output is not a workshop record (D6) ---- */
  if (c.recordOrigin && !RECORD_ORIGINS.includes(c.recordOrigin))
    E(ERR.SHAPE, `Unknown recordOrigin "${c.recordOrigin}".`, at("recordOrigin"));
  if (c.recordOrigin && !EXTRACTED_ORIGINS.includes(c.recordOrigin))
    E(ERR.REVIEWER_AS_SOURCE,
      `recordOrigin "${c.recordOrigin}" is reviewer output and does not belong in the ` +
      `extracted record set. Keep it as a separate annotation.`, at("recordOrigin"));

  /* ---- requirement type, after aliasing (D3) ---- */
  if (c.kind === "Requirement") {
    if (c.requirementType) {
      const canon = canonicalType(c.requirementType);
      if (!REQUIREMENT_TYPES.includes(canon))
        E(ERR.TYPE, `Unknown requirement type "${c.requirementType}".`, at("requirementType"));
      else if (canon !== c.requirementType && c.requirementTypeCanonical !== canon)
        E(ERR.TYPE, `"${c.requirementType}" is an alias of "${canon}"; record the canonical ` +
          `value in requirementTypeCanonical.`, at("requirementType"));
    }
  } else if (c.requirementType) {
    E(ERR.TYPE, `requirementType is set on a ${c.kind}.`, at("requirementType"));
  }

  /* ---- three states, never merged (D11) ---- */
  if (c.evidenceStatus && !EVIDENCE_STATUS.includes(c.evidenceStatus))
    E(ERR.STATUS_OVERREACH, `evidenceStatus "${c.evidenceStatus}" — a classifier reports; ` +
      `verification is a separate act.`, at("evidenceStatus"));
  if (c.annotationReview && !ANNOTATION_REVIEW.includes(c.annotationReview))
    E(ERR.STATUS_OVERREACH, `annotationReview "${c.annotationReview}" — adjudication is not ` +
      `something a classifier performs.`, at("annotationReview"));
  if (c.businessApproval && !BUSINESS_APPROVAL.includes(c.businessApproval))
    E(ERR.APPROVAL_FROM_ANNOTATION,
      `businessApproval "${c.businessApproval}". Annotation adjudication never becomes ` +
      `business approval; it is a different event with a different signatory.`,
      at("businessApproval"));

  /* ---- evidence ---- */
  const ev = Array.isArray(c.evidence) ? c.evidence : [];
  if (!ev.length) E(ERR.NO_EVIDENCE, "No evidence.", at("evidence"));
  for (const [i, e] of ev.entries()) {
    const path = `evidence[${i}]`;
    if (!isObj(e)) { E(ERR.SHAPE, "Evidence entry is not an object.", at(path)); continue; }
    if (!e.ref || !/^[0-9a-f]{6,}\/P-\d+$/.test(e.ref)) {
      E(ERR.BARE_PASSAGE, `Evidence cites "${e.ref ?? e.passageId ?? "(nothing)"}" without a ` +
        `document scope. Passage ids repeat across transcripts.`, at(path));
      continue;
    }
    const [fp] = e.ref.split("/");
    if (docFp && fp !== docFp) {
      E(ERR.REF_FOREIGN, `Evidence cites document ${fp}, not ${docFp}.`, at(path)); continue;
    }
    const pg = byRef.get(e.ref);
    if (!pg) { E(ERR.REF_UNRESOLVED, `"${e.ref}" does not resolve.`, at(path)); continue; }
    if (e.quote && !norm(pg.text).includes(norm(e.quote)))
      E(ERR.QUOTE_NOT_FOUND, `Quoted words are not in ${e.ref}. Presence is checked here; ` +
        `whether the passage supports the statement is not.`, at(path));
  }

  /* ---- priority: stated is not agreed (D2) ---- */
  if (c.programmePriority) {
    if (!c.programmePriorityRef)
      E(ERR.PRIORITY_CONFLATED,
        `programmePriority "${c.programmePriority}" with nothing establishing agreement. ` +
        `An obligation containing "must" does not set a programme priority.`,
        at("programmePriority"));
    else if (!byRef.has(c.programmePriorityRef))
      E(ERR.REF_UNRESOLVED, `programmePriorityRef does not resolve.`, at("programmePriorityRef"));
  }
  if (isObj(c.statedPriority)) {
    const refs = c.statedPriority.sourceRefs ?? (c.statedPriority.ref ? [c.statedPriority.ref] : []);
    if (!refs.length)
      E(ERR.PRIORITY_CONFLATED, "statedPriority has no passage reference.",
        at("statedPriority.sourceRefs"));
    for (const r of refs)
      if (!byRef.has(r))
        E(ERR.REF_UNRESOLVED, `statedPriority reference "${r}" does not resolve.`,
          at("statedPriority.sourceRefs"));
    /* "For me yes" is a qualifier. Without recording it, a personal priority
       reads as an agreed one. */
    if (!c.statedPriority.qualifier && c.statedPriority.qualified === undefined)
      E(ERR.PRIORITY_CONFLATED,
        "statedPriority records no qualifier. A personally qualified Must is not a " +
        "programme priority, and the distinction must survive in the record.",
        at("statedPriority.qualifier"));
  }

  /* ---- owner: a reported role is not a resolved person (D8, D11) ---- */
  if (isObj(c.owner)) {
    const { reportedRole, resolvedPerson, ref } = c.owner;
    if (resolvedPerson && !ref)
      E(ERR.ROLE_AS_PERSON, `owner.resolvedPerson "${resolvedPerson}" with no passage naming ` +
        `them. A role heard in a session is not an identified person.`, at("owner.ref"));
    if (resolvedPerson && reportedRole && !ref)
      E(ERR.ROLE_AS_PERSON, "A reported role has been promoted to a resolved person.",
        at("owner.resolvedPerson"));
    if (ref && !byRef.has(ref))
      E(ERR.REF_UNRESOLVED, "owner.ref does not resolve.", at("owner.ref"));
  }

  /* ---- a condition is not a date (D4) ---- */
  for (const f of ["dueDate", "endDate", "validationDate"]) {
    const v = c[f];
    if (v && !ISO_DATE.test(String(v)))
      E(ERR.CONDITION_AS_DATE,
        `${f} = "${v}" is not a calendar date. A condition such as "before we commit" ` +
        `belongs in ${f.replace("Date", "Condition")}, not here.`, at(f));
  }

  /* ---- entity mentions stay unresolved unless an id was given (D7) ----
     Scope and identity are different things. A-003 names Turkey and Argentina,
     so its scope is stated; what is absent is a legal entity id, and that gap
     is declared as resolvedEntityIds rather than pretending scope is missing. */
  const mentions = Array.isArray(c.entityMentions) ? c.entityMentions : [];
  const anyUnresolved = mentions.some(m => isObj(m) &&
    (m.resolution === "unresolved" || (!m.entityId && !m.resolved)));
  if (anyUnresolved && !(Array.isArray(c.missingFields) &&
      c.missingFields.some(f => /resolvedEntityIds|impactedEntities|entityIds/i.test(f))))
    E(ERR.ENTITY_UNRESOLVED,
      `Entity mentions (${mentions.map(m => m.text).join(", ")}) carry no entity id, and the ` +
      `gap is not declared. A country name is not a legal entity.`, at("missingFields"));

  for (const [i, m] of (Array.isArray(c.entityMentions) ? c.entityMentions : []).entries()) {
    if (!isObj(m)) { E(ERR.SHAPE, "entityMention is not an object.", at(`entityMentions[${i}]`)); continue; }
    if ((m.resolved || m.resolution === "resolved") && !m.entityId)
      E(ERR.ENTITY_UNRESOLVED,
        `"${m.text}" is marked resolved with no entity id. A country name is not a legal entity.`,
        at(`entityMentions[${i}].resolved`));
    const mref = m.ref ?? m.sourceRef;
    if (mref && !byRef.has(mref))
      E(ERR.REF_UNRESOLVED, `entityMentions[${i}] reference does not resolve.`,
        at(`entityMentions[${i}].sourceRef`));
  }

  /* ---- a Decision needs authority; an unconfirmed speaker cannot give it ---- */
  if (c.kind === "Decision") {
    const sp = ev.map(e => byRef.get(e.ref)?.speaker).filter(Boolean);
    if (sp.length && sp.every(s => s.certainty !== "confirmed"))
      E(ERR.AUTHORITY_FROM_UNCERTAIN,
        "Decision rests only on passages whose speaker is unconfirmed (C-03). A confirmed " +
        "speaker would still not establish authority over the subject.", at("kind"));
  }

  /* ---- a settled state must be established, not asserted (D9) ---- */
  const asserts = c.kind !== "Open question" && !/\?\s*$/.test(c.statement || "");
  if (strictSettledClaims && asserts && SETTLED_CLAIM.test(c.statement || "")) {
    const quoted = ev.map(e => byRef.get(e.ref)?.text || "").join(" ");
    const hedged = /\bi believe\b|\bprobably\b|\bi think\b|\bunless\b|\bi'd have to check\b/i.test(quoted);
    if (hedged)
      E(ERR.UNSUPPORTED_STATUS,
        `Statement asserts a settled state, but the passages cited hedge it. "Caught at ` +
        `review" proves neither correction nor an error still open.`, at("statement"));
  }

  /* ---- fields ---- */
  const fields = isObj(c.fields) ? c.fields : {};
  const missing = Array.isArray(c.missingFields) ? c.missingFields : [];
  for (const [name, f] of Object.entries(fields)) {
    if (!isObj(f)) { E(ERR.SHAPE, `fields.${name} is not an object.`, at(`fields.${name}`)); continue; }
    if (!FIELD_ORIGINS.includes(f.origin))
      E(ERR.INVENTED_FIELD, `fields.${name}.origin is "${f.origin}"; a classifier produces ` +
        `"extracted" or "absent".`, at(`fields.${name}.origin`));
    if (f.origin === "extracted") {
      if (f.value === null || f.value === undefined || f.value === "")
        E(ERR.SHAPE, `fields.${name} is extracted with no value.`, at(`fields.${name}`));
      else if (!f.ref)
        E(ERR.INVENTED_FIELD, `fields.${name} = "${f.value}" is extracted with no reference.`,
          at(`fields.${name}.ref`));
      else if (!byRef.has(f.ref))
        E(ERR.REF_UNRESOLVED, `fields.${name}.ref does not resolve.`, at(`fields.${name}.ref`));
    }
    if (f.origin === "absent" && f.value !== null && f.value !== undefined)
      E(ERR.INVENTED_FIELD, `fields.${name} is absent but carries "${f.value}".`,
        at(`fields.${name}`));
  }
  for (const name of REQUIRED_FIELDS[c.kind] ?? []) {
    const f = fields[name];
    const supplied = f && f.origin === "extracted" && f.value;
    const topLevel = c[name] !== undefined && c[name] !== null && c[name] !== "";
    if (!supplied && !topLevel && !missing.includes(name))
      E(ERR.MISSING_NOT_NAMED,
        `${c.kind} requires "${name}"; not extracted and not listed in missingFields.`,
        at("missingFields"));
  }

  /* ---- reviewer-generated links must say so ---- */
  for (const [i, r] of (Array.isArray(c.relationships) ? c.relationships : []).entries()) {
    if (!isObj(r) || !RELATION_ORIGINS.includes(r.origin))
      E(ERR.REVIEWER_AS_SOURCE,
        `relationships[${i}] must declare origin ${RELATION_ORIGINS.join(" or ")}, so a ` +
        `reviewer's analysis is not read as something a participant said.`,
        at(`relationships[${i}].origin`));
  }
  for (const [i, pr] of (Array.isArray(c.proposals) ? c.proposals : []).entries()) {
    if (!isObj(pr) || !PROPOSAL_TYPES.includes(pr.type))
      E(ERR.REVIEWER_AS_SOURCE, `proposals[${i}] must declare a type.`, at(`proposals[${i}].type`));
    else if (pr.text && c.statement && norm(pr.text) === norm(c.statement))
      E(ERR.REVIEWER_AS_SOURCE, `proposals[${i}] repeats the statement.`, at(`proposals[${i}]`));
  }
}

function report(output, errors) {
  const bad = new Set(errors.map(e => e.candidate).filter(Boolean));
  const fatal = errors.some(e => !e.candidate);
  const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
  return {
    valid: errors.length === 0,
    errors,
    accepted: fatal ? [] : candidates.filter(c => !bad.has(c?.id)),
    rejected: fatal ? candidates : candidates.filter(c => bad.has(c?.id)),
    summary: errors.reduce((m, e) => (m[e.code] = (m[e.code] || 0) + 1, m), {}),
  };
}
