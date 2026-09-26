/* Transcript structuring. No model, no network, no credentials.

   Produces passages with repeatable IDs and speakers resolved against a roster
   the user supplies. Resolves nothing it was not told: a name absent from the
   roster stays unresolved, and an explicit uncertainty marker never acquires a
   designation, because a designation decides whether a statement can be a
   decision at all. */

export const SCHEMA = "arqon.transcript/1";

/* A content fingerprint, not a cryptographic hash. Deterministic, so the same
   file always yields the same passage IDs and drift is detectable. */
export function fingerprint(text){
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++){
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8,"0") + h2.toString(16).padStart(8,"0")).slice(0,12);
}

const TURN = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?)?\s*([^:]{1,64}):\s*(.+)$/;
const PAREN = /^(.+?)\s*\(([^)]+)\)\s*$/;
const UNCERTAIN = /\buncertain\b|\bunsure\b|unidentified|unknown speaker|inaudible|speaker\s*\d|\?\s*$/i;
const DOUBT = /probably|i think it was|sorry,? who|who was that/i;

/* Designations routinely contain commas — "Regional finance lead, EMEA" — so a
   naive split truncates exactly the fields that matter. */
function splitCsv(line){
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (c === '"'){
      if (inQuotes && line[i + 1] === '"'){ cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes){ out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/* roster: [{name, designation}] */
export function parseRoster(text){
  const rows = [], errors = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const seen = new Map();
  for (const [i, line] of lines.entries()){
    if (i === 0 && /^name\s*,/i.test(line)) continue;           // header
    const parts = splitCsv(line);
    if (parts.length < 2 || !parts[0] || !parts[1]){
      errors.push(`Line ${i + 1}: expected "name, designation" — got "${line.slice(0, 48)}"`);
      continue;
    }
    const [name, designation] = parts;
    const k = name.toLowerCase();
    if (seen.has(k) && seen.get(k).toLowerCase() !== designation.toLowerCase()){
      errors.push(`"${name}" is listed twice with different designations: ` +
                  `"${seen.get(k)}" and "${designation}". Resolve before importing.`);
      continue;
    }
    seen.set(k, designation);
    rows.push({ name, designation });
  }
  return { roster: rows, errors };
}

function resolve(label, roster){
  const s = label.trim();
  const base = { raw: s, designation: "", rosterDesignation: "", inlineDesignation: "" };
  if (UNCERTAIN.test(s)){
    const m = PAREN.exec(s);
    if (m) base.inlineDesignation = m[1].trim();
    return { ...base, certainty: "uncertain", why: "explicit uncertainty marker — no designation assigned" };
  }
  const byName = new Map(roster.map(r => [r.name.toLowerCase(), r.designation]));
  const designations = new Set(roster.map(r => r.designation.toLowerCase()));

  const m = PAREN.exec(s);
  if (m){
    const role = m[1].trim(), name = m[2].trim();
    base.inlineDesignation = role;
    const rd = byName.get(name.toLowerCase());
    if (rd === undefined)
      return { ...base, designation: role, certainty: "reported",
               why: `designation given in the transcript; "${name}" is not on the roster` };
    base.rosterDesignation = rd;
    if (rd.toLowerCase() !== role.toLowerCase())
      return { ...base, certainty: "conflict",
               why: `transcript says "${role}", roster says "${rd}" — neither is used` };
    return { ...base, designation: role, certainty: "confirmed", why: "confirmed against the roster" };
  }
  const rd = byName.get(s.toLowerCase());
  if (rd !== undefined)
    return { ...base, designation: rd, rosterDesignation: rd, certainty: "confirmed", why: "matched on the roster" };
  if (designations.has(s.toLowerCase()))
    return { ...base, designation: s, inlineDesignation: s, certainty: "reported",
             why: "a designation was given directly; there is no name to confirm it against" };
  const near = nearMatches(s, roster);
  return { ...base, certainty: "unresolved", suggestions: near,
           why: near.length
             ? `not on the roster. Similar entries: ${near.map(n => `"${n.name}" (${n.designation})`).join("; ")}`
               + ". Confirm or add to the roster — this is a suggestion, not a match."
             : "not on the roster and no designation given" };
}

/* A transcript says "D. Ahmed"; the roster says "Dele Ahmed". Suggest, never
   resolve: a wrong designation decides whether a statement can be a decision,
   and two sources that merely look alike are not confirmation. */
function nearMatches(label, roster){
  const tokens = (s) => s.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  const a = tokens(label);
  if (!a.length) return [];
  const surname = a[a.length - 1];
  return roster.filter(r => {
    const b = tokens(r.name);
    if (!b.length) return false;
    if (b[b.length - 1] !== surname) return false;      // same surname
    if (a.length === 1 || b.length === 1) return true;
    return a[0][0] === b[0][0];                          // and same first initial
  }).slice(0, 3);
}

export function structure(text, { roster = [], filename = "transcript.txt", workshop = "" } = {}){
  const fp = fingerprint(text);
  const lines = text.split(/\r?\n/);
  const passages = [];
  let n = 0;

  for (const [i, raw] of lines.entries()){
    const line = raw.trim();
    if (!line) continue;
    n++;
    const id = `P-${String(n).padStart(3, "0")}`;
    const m = TURN.exec(line);
    if (!m){
      passages.push({ id, sourceLine: i + 1, time: "", speaker: null, text: line,
                      parse: "unparsed", why: "did not match [time] Speaker: text" });
      continue;
    }
    const sp = resolve(m[2], roster);
    passages.push({ id, sourceLine: i + 1, time: m[1] || "", speaker: sp,
                    text: m[3].trim(), parse: "ok" });
  }

  /* A later turn casting doubt marks the nearby speaker uncertain. Never resolves it. */
  passages.forEach((p, i) => {
    if (p.parse === "ok" && DOUBT.test(p.text))
      passages.slice(Math.max(0, i - 3), i).forEach(q => {
        if (q.speaker?.certainty === "uncertain") q.speaker.why += `; doubt raised at ${p.id}`;
      });
  });

  const speakers = new Map();
  for (const p of passages){
    if (!p.speaker) continue;
    const k = p.speaker.raw;
    if (!speakers.has(k)) speakers.set(k, { ...p.speaker, passages: [] });
    speakers.get(k).passages.push(p.id);
  }

  const issues = [];
  for (const s of speakers.values())
    if (s.certainty !== "confirmed")
      issues.push({ type: "speaker", certainty: s.certainty, speaker: s.raw,
                    detail: s.why, suggestions: s.suggestions || [], passages: s.passages });
  for (const p of passages)
    if (p.parse === "unparsed")
      issues.push({ type: "line", passage: p.id, detail: p.why,
                    text: p.text.slice(0, 60) });

  return {
    schema: SCHEMA,
    source: { filename, fingerprint: fp, bytes: text.length, lines: lines.length,
              importedAt: new Date().toISOString(), workshop: workshop || null },
    roster,
    passages,
    speakers: [...speakers.values()],
    issues,
    state: issues.length ? "prepared with unresolved items" : "prepared",
  };
}
