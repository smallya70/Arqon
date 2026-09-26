/* Everything both views display, computed from RECORDS. Nothing is stated twice.

   The rule: if a figure appears on a screen, it is derived here. A hardcoded
   total is a figure that can drift from its own data, and a reader who catches
   one stops believing the rest. */

import { PROGRAMME, ROLES, WORKSHOPS, RECORDS, ARCHETYPES, ANALYST_QUEUE, PASSAGES } from "./dataset.js";
export { PROGRAMME, ROLES, WORKSHOPS, RECORDS, ARCHETYPES, ANALYST_QUEUE, PASSAGES };

/* Only analyst-reviewed records count towards programme figures. Anything still
   in the queue has not been confirmed as an accurate capture. */
export const approved = RECORDS.filter(r => r.reviewStatus === "Approved");
export const inQueue  = RECORDS.filter(r => r.reviewStatus !== "Approved");

export const isReady = (r) => r.blockers.length === 0;

export const byKind = () => {
  const m = new Map();
  for (const r of approved) {
    if (!m.has(r.kind)) m.set(r.kind, { kind: r.kind, total: 0, ready: 0, blocked: 0, blockers: new Set() });
    const k = m.get(r.kind);
    k.total++;
    isReady(r) ? k.ready++ : k.blocked++;
    r.blockers.forEach(b => k.blockers.add(b));
  }
  return [...m.values()]
    .map(k => ({ ...k, blockers: [...k.blockers].join(", ") || "—" }))
    .sort((a, b) => b.total - a.total);
};

export const byOwner = () => {
  const m = new Map();
  for (const r of approved.filter(r => !isReady(r))) {
    const role = r.owner || "Unassigned";
    if (!m.has(role)) m.set(role, { role, count: 0, oldestDays: 0, subjects: new Set() });
    const o = m.get(role);
    o.count++;
    o.oldestDays = Math.max(o.oldestDays, r.ageDays);
    const ws = WORKSHOPS.find(w => w.id === r.workshop);
    if (ws) o.subjects.add(ws.title);
  }
  return [...m.values()]
    .map(o => ({
      ...o,
      side: ROLES.find(x => x.role === o.role)?.side || "—",
      email: ROLES.find(x => x.role === o.role)?.email || "",
      subjects: [...o.subjects].join(", "),
    }))
    .sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays);
};

export const blockedFor = (role) =>
  approved.filter(r => !isReady(r) && (r.owner || "Unassigned") === role);

export const recordsFor = (workshopId) => RECORDS.filter(r => r.workshop === workshopId);

export const workshopRows = () => WORKSHOPS.map(w => {
  const rs = recordsFor(w.id).filter(r => r.reviewStatus === "Approved");
  return {
    ...w,
    records: rs.length,
    questions: rs.filter(r => r.kind === "Open question").length,
  };
});

export const coverage = () => ARCHETYPES.map(([name, entities, workshops]) => ({
  name, entities, workshops,
  status: workshops.length === 0 ? "gap"
        : workshops.some(id => recordsFor(id).some(r => r.blockers.length)) ? "partial"
        : "covered",
  note: workshops.length ? `established in ${workshops.join(", ")}` : "no workshop covers this yet",
}));

export const totals = () => {
  const k = byKind(), o = byOwner();
  const done = WORKSHOPS.filter(w => w.state === "done");
  const t = {
    workshopsDone: done.length,
    workshopsTotal: WORKSHOPS.length,
    records: approved.length,
    ready: approved.filter(isReady).length,
    blocked: approved.filter(r => !isReady(r)).length,
    queue: inQueue.length,
    clientBlocked: o.filter(x => x.side === "client").reduce((n, x) => n + x.count, 0),
    diBlocked:     o.filter(x => x.side === "DI").reduce((n, x) => n + x.count, 0),
    unassigned:    o.find(x => x.role === "Unassigned")?.count || 0,
    oldestDays: Math.max(0, ...o.map(x => x.oldestDays)),
    gaps: coverage().filter(c => c.status === "gap").length,
    openQuestions: approved.filter(r => r.kind === "Open question").length,
  };
  t.fromWorkshops = workshopRows().reduce((n, w) => n + w.records, 0);
  t.fromKinds     = k.reduce((n, x) => n + x.total, 0);
  /* Identities that must hold. Checked rather than assumed. */
  t.reconciled =
    t.records === t.fromWorkshops &&
    t.records === t.fromKinds &&
    t.ready + t.blocked === t.records &&
    t.clientBlocked + t.diBlocked + t.unassigned === t.blocked;
  return t;
};
