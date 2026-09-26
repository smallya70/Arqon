/* Deterministic checks over an imported ownership register.

   None of these needs a model. Missing identifiers, duplicates, conflicting
   periods, percentages that do not sum, absent parents and ownership cycles
   are all arithmetic and set operations. Running them as code rather than as
   prompts makes them repeatable, explainable to an auditor, and free.

   A model is useful in exactly two places downstream: proposing matches for
   inconsistent names (§match.js), and drafting the question text once a
   finding exists. Neither decides anything.

   Every finding carries its evidence: the sheet, the row, the entity name as
   written, and the document version. A finding without that is an opinion. */

const F = (code, severity, entity, message, evidence, remedy) =>
  ({ code, severity, entity, message, evidence, remedy });

/* Rows arrive as: {sheet,row,code,name,country,parentCode,parentName,pct,from,to,method,notes} */

export function missingIdentifier(rows) {
  return rows
    .filter(r => !r.code || !String(r.code).trim())
    .map(r => F("OWN-01", "high", r.name,
      "No entity code. The entity cannot be matched to any other source.",
      [r], "Ask legal for the code, or confirm the entity is not yet registered."));
}

export function duplicateCode(rows) {
  const byCode = new Map();
  rows.filter(r => r.code).forEach(r => {
    if (!byCode.has(r.code)) byCode.set(r.code, []);
    byCode.get(r.code).push(r);
  });
  const out = [];
  for (const [code, rs] of byCode) {
    const names = [...new Set(rs.map(r => r.name))];
    if (rs.length > 1 && names.length > 1 && !overlapping(rs).length)
      out.push(F("OWN-02", "high", code,
        `Same code recorded under ${names.length} different names: ${names.join(" / ")}. ` +
        `If these are one entity the holding is double counted; if two, one has the wrong code.`,
        rs, "Confirm which name is the legal name and retire the other row."));
  }
  return out;
}

function overlaps(a, b) {
  const s1 = a.from || "0000-01-01", e1 = a.to || "9999-12-31";
  const s2 = b.from || "0000-01-01", e2 = b.to || "9999-12-31";
  return s1 <= e2 && s2 <= e1;
}

function overlapping(rs) {
  const out = [];
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++)
      if (rs[i].pct != null && rs[j].pct != null &&
          rs[i].pct !== rs[j].pct &&
          rs[i].parentCode === rs[j].parentCode &&
          overlaps(rs[i], rs[j])) out.push([rs[i], rs[j]]);
  return out;
}

export function conflictingPeriods(rows) {
  const byCode = new Map();
  rows.filter(r => r.code).forEach(r => {
    if (!byCode.has(r.code)) byCode.set(r.code, []);
    byCode.get(r.code).push(r);
  });
  const out = [];
  for (const [code, rs] of byCode)
    for (const [a, b] of overlapping(rs))
      out.push(F("OWN-03", "high", code,
        `Two different ownership percentages (${a.pct}% and ${b.pct}%) apply to overlapping ` +
        `periods under the same parent.`,
        [a, b], "Close the earlier period with an end date, or correct the percentage."));
  return out;
}

export function percentagesDoNotSum(rows) {
  /* Identical rows are a duplicate (OWN-02), not a holder. Counting them here
     would report the same defect twice under two different codes. */
  const seen = new Set();
  const distinct = rows.filter(r => {
    const k = [r.code, r.parentCode, r.pct, r.from, r.to].join("|");
    return seen.has(k) ? false : seen.add(k);
  });
  const byChild = new Map();
  distinct.filter(r => r.code && r.pct != null && r.parentCode).forEach(r => {
    const k = r.code + "|" + (r.from || "");
    if (!byChild.has(k)) byChild.set(k, []);
    byChild.get(k).push(r);
  });
  const out = [];
  for (const [, rs] of byChild) {
    if (rs.length < 2) continue;
    const total = rs.reduce((n, r) => n + r.pct, 0);
    if (Math.abs(total - 100) > 0.01)
      out.push(F("OWN-04", "high", rs[0].code,
        `Holdings sum to ${total}%, not 100%, for the period from ${rs[0].from}.`,
        rs, "Identify the missing holder, or correct the percentages."));
  }
  return out;
}

export function ownershipOutOfRange(rows) {
  return rows
    .filter(r => r.pct != null && (r.pct < 0 || r.pct > 100))
    .map(r => F("OWN-05", "high", r.code || r.name,
      `Ownership recorded as ${r.pct}%.`,
      [r], "Correct the percentage at source."));
}

export function missingEffectiveDate(rows) {
  return rows
    .filter(r => r.parentCode && !r.from)
    .map(r => F("OWN-06", "high", r.code || r.name,
      "No effective-from date. A mid-period acquisition cannot consolidate from the " +
      "acquisition date without one.",
      [r], "Ask legal for the acquisition or incorporation date."));
}

export function endBeforeStart(rows) {
  return rows
    .filter(r => r.from && r.to && r.to < r.from)
    .map(r => F("OWN-07", "high", r.code || r.name,
      `Effective to (${r.to}) precedes effective from (${r.from}).`,
      [r], "Correct the dates, or confirm whether the entity was disposed of."));
}

export function parentNotInRegister(rows) {
  const codes = new Set(rows.filter(r => r.code).map(r => r.code));
  const seen = new Set();
  return rows
    .filter(r => r.parentCode && !codes.has(r.parentCode) && !seen.has(r.parentCode) && seen.add(r.parentCode))
    .map(r => F("OWN-08", "high", r.code || r.name,
      `Parent ${r.parentCode} (${r.parentName || "unnamed"}) does not appear in this register.`,
      [r], "Obtain the parent entity, or correct the parent code."));
}

export function ownershipCycle(rows) {
  const parent = new Map();
  rows.filter(r => r.code && r.parentCode).forEach(r => parent.set(r.code, r.parentCode));
  const out = [], reported = new Set();
  for (const start of parent.keys()) {
    const path = [];
    let cur = start, guard = 0;
    while (cur && guard++ < 100) {
      if (path.includes(cur)) {
        const cycle = path.slice(path.indexOf(cur)).concat(cur);
        const key = [...new Set(cycle)].sort().join(">");
        if (!reported.has(key)) {
          reported.add(key);
          out.push(F("OWN-09", "high", cycle[0],
            `Circular ownership: ${cycle.join(" → ")}.`,
            rows.filter(r => cycle.includes(r.code)),
            "Confirm the true holding structure. A cycle cannot be consolidated as recorded."));
        }
        break;
      }
      path.push(cur);
      cur = parent.get(cur);
    }
  }
  return out;
}

/* Control implied by percentage versus the method recorded. This one is a
   prompt for a human, never a conclusion: >50% usually means consolidate, but
   contractual arrangements override it, and the register does not hold them. */
export function methodInconsistentWithHolding(rows) {
  /* Compare the method against the entity's TOTAL holding, not a single row.
     A 10% row is the minority leg of a split holding and is not an anomaly;
     flagging it was a false positive found by running this against data. */
  const total = new Map();
  rows.filter(r => r.code && r.pct != null)
      .forEach(r => total.set(r.code, (total.get(r.code) || 0) + r.pct));
  const holders = new Map();
  rows.filter(r => r.code).forEach(r => holders.set(r.code, (holders.get(r.code) || 0) + 1));

  return rows
    .filter(r => r.pct != null && r.method && r.code)
    .filter(r => holders.get(r.code) === 1)          // single-holder entities only
    .filter(r => {
      const t = total.get(r.code);
      return (t > 50 && /equity|associate/i.test(r.method)) ||
             (t < 20 && /full/i.test(r.method));
    })
    .map(r => F("OWN-10", "medium", r.code || r.name,
      `${r.pct}% holding recorded with "${r.method}" method. That combination usually indicates ` +
      `either a shareholder agreement the register does not capture, or an error.`,
      [r], "Ask accounting policy which is correct. Do not infer control from the percentage."));
}

export const CHECKS = [
  missingIdentifier, duplicateCode, conflictingPeriods, percentagesDoNotSum,
  ownershipOutOfRange, missingEffectiveDate, endBeforeStart, parentNotInRegister,
  ownershipCycle, methodInconsistentWithHolding,
];

export function runAll(rows) {
  return CHECKS.flatMap(fn => fn(rows));
}
