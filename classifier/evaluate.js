/* Comparison against the reviewed reference.

   Passage overlap is not coverage. Two candidates can both cite P-009 and
   capture entirely different obligations from it — one the rate rule, one the
   override prohibition. So overlap produces a *shortlist for a person*, never a
   coverage figure, and this module refuses to report coverage until someone has
   said which shortlisted candidate actually captures the obligation.

   What can be counted without judgement:
     - obligations no candidate even cites the evidence for  (definitely missed)
     - candidates citing passages the reference does not use (possibly extra)
     - citations that do not resolve                         (structural)
     - fields asserted with nothing behind them              (structural)

   What cannot:
     - whether a shortlisted candidate captures the obligation
     - whether a kind disagreement is an error or a defensible reading

   This is a synthetic functional test on one non-blind transcript. It is not a
   measure of accuracy and no percentage is produced. */

const overlap = (a, b) => a.filter(x => b.includes(x)).length;
const refsOf = (r) => (r.evidence ?? []).map(e => e.ref).filter(Boolean);

export function shortlist(candidates, reference) {
  const refRecs = reference.records;
  const cands = candidates.candidates ?? [];

  const rows = refRecs.map(r => {
    const rr = refsOf(r);
    const near = cands
      .map(c => ({ c, shared: refsOf(c).filter(x => rr.includes(x)) }))
      .filter(x => x.shared.length)
      .sort((a, b) => b.shared.length - a.shared.length);
    return {
      obligation: r.id, kind: r.kind, statement: r.statement, passages: rr,
      shortlisted: near.map(n => ({ id: n.c.id, kind: n.c.kind,
        statement: n.c.statement, sharedPassages: n.shared })),
      /* Only this is knowable without a person. */
      noCandidateCitesTheEvidence: near.length === 0,
    };
  });

  const refRefs = new Set(refRecs.flatMap(refsOf));
  const outside = cands.filter(c => !refsOf(c).some(x => refRefs.has(x))).map(c => ({
    id: c.id, kind: c.kind, statement: c.statement, passages: refsOf(c),
  }));

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
      referenceObligations: refRecs.length,
      candidates: cands.length,
      note: "Synthetic functional test on one non-blind transcript. Passage overlap is a " +
            "shortlist, not coverage: a person must say which candidate captures each " +
            "obligation. No accuracy figure is produced or supportable.",
      kindsAbsentFromReference: ["Decision", "Assumption", "Risk", "Exception"]
        .filter(k => !refRecs.some(r => r.kind === k)),
    },
    countable: {
      obligationsWithNoCandidateCitingTheirEvidence:
        rows.filter(r => r.noCandidateCitesTheEvidence).length,
      obligationsNeedingManualCheck: rows.filter(r => !r.noCandidateCitesTheEvidence).length,
      candidatesCitingPassagesTheReferenceDoesNotUse: outside.length,
      unsupportedFields: unsupported.length,
    },
    rows, outside, unsupported,
  };
}

/* A worksheet a person fills in. One line per obligation-candidate pair, marked
   y or n. Nothing is counted as captured until this comes back. */
export function worksheet(s) {
  const out = [
    `# Obligation capture check — ${s.basis.reference}`,
    ``,
    `Mark each pair: y = this candidate captures the obligation, n = it does not.`,
    `Sharing a passage is not capturing an obligation, which is why this cannot be`,
    `counted automatically.`,
    ``,
    `| mark | obligation | kind | candidate | candidate kind | shared |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const r of s.rows) {
    if (!r.shortlisted.length) {
      out.push(`| — | ${r.obligation} | ${r.kind} | (none cite its evidence) | | |`);
      continue;
    }
    for (const c of r.shortlisted)
      out.push(`| ? | ${r.obligation} | ${r.kind} | ${c.id} | ${c.kind} | ${c.sharedPassages.join(" ")} |`);
  }
  out.push(``, `## Obligations`, ``);
  s.rows.forEach(r => out.push(`- **${r.obligation}** (${r.kind}) ${r.statement}`));
  out.push(``, `## Shortlisted candidates`, ``);
  const seen = new Set();
  s.rows.flatMap(r => r.shortlisted).forEach(c => {
    if (seen.has(c.id)) return; seen.add(c.id);
    out.push(`- **${c.id}** (${c.kind}) ${c.statement}`);
  });
  if (s.outside.length) {
    out.push(``, `## Candidates citing passages the reference does not use`, ``);
    s.outside.forEach(c => out.push(`- **${c.id}** (${c.kind}) ${c.statement} — ${c.passages.join(" ")}`));
    out.push(``, `These are not errors. The reference is one reviewer's reading; a supported`,
             `record it did not retain may still be correct.`);
  }
  return out.join("\n");
}

/* Final counts, from a worksheet someone has marked. */
export function confirm(s, markedText) {
  const marks = new Map();
  for (const line of markedText.split("\n")) {
    const m = /^\|\s*([yn])\s*\|\s*(\S+)\s*\|[^|]*\|\s*(\S+)\s*\|/i.exec(line.trim());
    if (m) marks.set(`${m[2]}|${m[3]}`, m[1].toLowerCase() === "y");
  }
  const captured = [], missed = [], unchecked = [];
  for (const r of s.rows) {
    if (r.noCandidateCitesTheEvidence) { missed.push({ ...r, why: "no candidate cites its evidence" }); continue; }
    const decided = r.shortlisted.map(c => marks.get(`${r.obligation}|${c.id}`));
    if (decided.some(d => d === true)) captured.push(r.obligation);
    else if (decided.every(d => d === false)) missed.push({ ...r, why: "shortlisted candidates do not capture it" });
    else unchecked.push(r.obligation);
  }
  return {
    basis: s.basis,
    counts: {
      obligationsCaptured: captured.length,
      obligationsMissed: missed.length,
      obligationsUnchecked: unchecked.length,
      candidatesOutsideTheReference: s.outside.length,
      unsupportedFields: s.unsupported.length,
    },
    captured, missed, unchecked,
    complete: unchecked.length === 0,
    note: unchecked.length
      ? `${unchecked.length} obligation(s) are unmarked. Counts are incomplete.`
      : "Every obligation has been checked by hand.",
  };
}
