/* Coverage of a candidate set against the reviewed reference.

   This is not accuracy. The reference is one synthetic transcript, reviewed
   non-blind, containing no Decisions, Assumptions, Risks or Exceptions. What it
   supports is counting: which obligations nobody extracted, which candidates
   carry unsupported fields, where kinds disagree, and which citations do not
   resolve.

   Segmentation is deliberately not scored. Fourteen is the reference's
   decomposition, not a target: a candidate covering two reference records, or
   two covering one, is matched on passage overlap and reported as such. */

const overlap = (a, b) => a.filter(x => b.includes(x)).length;
const refsOf = (r) => (r.evidence ?? []).map(e => e.ref).filter(Boolean);

export function evaluate(candidates, reference) {
  const refRecs = reference.records;
  const cands = candidates.candidates ?? [];

  /* Match on shared passages. A reference obligation is covered if some
     candidate cites at least one of the passages that establish it. */
  const matches = [];
  for (const r of refRecs) {
    const rr = refsOf(r);
    const hits = cands
      .map(c => ({ c, n: overlap(refsOf(c), rr) }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n);
    matches.push({ reference: r, covering: hits.map(h => h.c) });
  }

  const missed = matches.filter(m => m.covering.length === 0).map(m => ({
    id: m.reference.id, kind: m.reference.kind,
    statement: m.reference.statement, passages: refsOf(m.reference),
  }));

  const kindDisagreements = matches
    .filter(m => m.covering.length && !m.covering.some(c => c.kind === m.reference.kind))
    .map(m => ({ reference: m.reference.id, referenceKind: m.reference.kind,
                 candidateKinds: [...new Set(m.covering.map(c => c.kind))],
                 candidates: m.covering.map(c => c.id) }));

  const typeDisagreements = matches
    .filter(m => m.reference.requirementType && m.covering.some(c => c.kind === "Requirement"))
    .filter(m => !m.covering.some(c =>
      (c.requirementTypeCanonical ?? c.requirementType) === m.reference.requirementType))
    .map(m => ({ reference: m.reference.id, referenceType: m.reference.requirementType,
                 candidateTypes: m.covering.map(c => c.requirementTypeCanonical ?? c.requirementType) }));

  const refRefs = new Set(refRecs.flatMap(refsOf));
  const unmatched = cands.filter(c => !refsOf(c).some(x => refRefs.has(x))).map(c => ({
    id: c.id, kind: c.kind, statement: c.statement, passages: refsOf(c),
  }));

  /* Fields asserted with nothing behind them. Structural validation catches the
     clear cases; this counts what survived it. */
  const unsupported = [];
  for (const c of cands) {
    if (c.programmePriority && !c.programmePriorityRef)
      unsupported.push({ candidate: c.id, field: "programmePriority", value: c.programmePriority });
    if (c.owner?.resolvedPerson && !c.owner?.ref)
      unsupported.push({ candidate: c.id, field: "owner.resolvedPerson", value: c.owner.resolvedPerson });
    for (const m of c.entityMentions ?? [])
      if ((m.resolved || m.resolution === "resolved") && !m.entityId)
        unsupported.push({ candidate: c.id, field: "entityMentions", value: m.text });
    for (const f of ["dueDate", "endDate", "validationDate"])
      if (c[f] && !/^\d{4}-\d{2}-\d{2}$/.test(String(c[f])))
        unsupported.push({ candidate: c.id, field: f, value: c[f] });
  }

  return {
    basis: {
      reference: reference.fixtureId,
      referenceRecords: refRecs.length,
      candidates: cands.length,
      note: "Counts on one synthetic, non-blind transcript. Not an accuracy measure. " +
            "Segmentation is not scored: equivalent supported splitting or merging is acceptable.",
      kindsAbsentFromReference: ["Decision", "Assumption", "Risk", "Exception"]
        .filter(k => !refRecs.some(r => r.kind === k)),
    },
    counts: {
      obligationsCovered: matches.length - missed.length,
      obligationsMissed: missed.length,
      candidatesNotInReference: unmatched.length,
      kindDisagreements: kindDisagreements.length,
      requirementTypeDisagreements: typeDisagreements.length,
      unsupportedFields: unsupported.length,
    },
    missed, kindDisagreements, typeDisagreements, unmatched, unsupported,
  };
}
