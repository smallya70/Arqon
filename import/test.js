/* Importer core regression. Pure functions, no DOM, no network. */
import { structure, parseRoster, fingerprint, SCHEMA } from "./core.js";
let fail = 0;
const t = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   " + d)); if (!c) fail++; };

const ROSTER = `name, designation
Maria Torres, Facilitator
Hui Lim, "Regional finance lead, APAC"
Dele Ahmed, Group controller
Sade Okonjo, Accounting policy lead
D. Ahmed, Regional finance manager`;

console.log("\nroster");
const { roster, errors } = parseRoster(ROSTER);
t("five entries", roster.length === 5, String(roster.length));
t("quoted comma preserved", roster[1].designation === "Regional finance lead, APAC", roster[1].designation);
t("header skipped", !roster.some(r => /^name$/i.test(r.name)));
t("no errors", errors.length === 0, errors.join("; "));

const bad = parseRoster("A, One\nA, Two\nmalformed line");
t("contradictory duplicate rejected", bad.errors.some(e => /listed twice/.test(e)));
t("malformed line reported", bad.errors.some(e => /expected/.test(e)));
t("identical duplicate accepted", parseRoster("A, One\nA, One").errors.length === 0);

console.log("\nfingerprint");
const a = fingerprint("hello world"), b = fingerprint("hello world"), c = fingerprint("hello worlds");
t("deterministic", a === b, `${a} ${b}`);
t("changes with content", a !== c);
t("twelve characters", a.length === 12, a);

console.log("\nstructure");
const TXT = `[09:04] Maria Torres: What rate do the entities use?
[09:09] Unidentified speaker: We fixed Vietnam in March.
[09:10] Hui Lim: That was probably Wei on the line.
[09:12] Group controller (D. Ahmed): The register is quarterly.
[09:14] Accounting policy lead (uncertain): Monthly will not help.
[09:15] J. Novak: We parked that last year.
[09:16] Sade Okonjo: Turkey and Argentina restate first.`;
const s = structure(TXT, { roster, filename: "t.txt", workshop: "W-049" });

t("schema stamped", s.schema === SCHEMA, s.schema);
t("seven passages", s.passages.length === 7, String(s.passages.length));
t("ids are sequential and padded", s.passages[0].id === "P-001" && s.passages[6].id === "P-007");
t("source line recorded", s.passages[0].sourceLine === 1);
t("workshop carried", s.source.workshop === "W-049");

const by = id => s.passages.find(p => p.id === id).speaker;
t("roster name confirmed", by("P-001").certainty === "confirmed" && by("P-001").designation === "Facilitator");
t("unidentified stays uncertain", by("P-002").certainty === "uncertain" && by("P-002").designation === "");
t("doubt back-flagged", /doubt raised at P-003/.test(by("P-002").why), by("P-002").why);
t("inline vs roster conflict", by("P-004").certainty === "conflict" && by("P-004").designation === "");
t("both claims kept on conflict",
  by("P-004").inlineDesignation === "Group controller" &&
  by("P-004").rosterDesignation === "Regional finance manager",
  JSON.stringify({ i: by("P-004").inlineDesignation, r: by("P-004").rosterDesignation }));
t("explicit uncertainty beats a stated role", by("P-005").certainty === "uncertain" && by("P-005").designation === "");
t("name off the roster is unresolved", by("P-006").certainty === "unresolved" && by("P-006").designation === "");
t("roster name resolved", by("P-007").designation === "Accounting policy lead");

console.log("\nnear matches suggested, never applied");
const nm = structure("[09:00] S Okonjo: something", { roster, filename: "n.txt" });
const sp = nm.passages[0].speaker;
t("still unresolved", sp.certainty === "unresolved" && sp.designation === "");
t("similar roster entry suggested", (sp.suggestions || []).some(x => x.name === "Sade Okonjo"),
  JSON.stringify(sp.suggestions));
t("stated as a suggestion, not a match", /suggestion, not a match/.test(sp.why));
const far = structure("[09:00] Q Zhang: something", { roster, filename: "f.txt" });
t("no suggestion when nothing is similar", (far.passages[0].speaker.suggestions || []).length === 0);
const wrongInitial = structure("[09:00] D Okonjo: something", { roster, filename: "w.txt" });
t("a different first initial is not suggested",
  (wrongInitial.passages[0].speaker.suggestions || []).length === 0,
  JSON.stringify(wrongInitial.passages[0].speaker.suggestions));

console.log("\nmalformed rosters are rejected, not truncated");
const mal = parseRoster('name, designation\nAlice, Regional finance lead, EMEA\nBob, "Unclosed\nCarol, "Regional finance lead, APAC"');
t("unquoted comma rejected", mal.errors.some(e => /3 fields/.test(e)), mal.errors.join(" | "));
t("the fix is shown", mal.errors.some(e => /quote it: Alice/.test(e)));
t("unclosed quote rejected", mal.errors.some(e => /unclosed quote/i.test(e)));
t("no truncated designation accepted",
  !mal.roster.some(r => r.designation === "Regional finance lead"),
  JSON.stringify(mal.roster));
t("the valid quoted row survives",
  mal.roster.some(r => r.designation === "Regional finance lead, APAC"));

console.log("\ndocument-scoped passage references");
const d1 = structure("[09:00] Maria Torres: one", { roster, filename: "a.txt" });
const d2 = structure("[09:00] Maria Torres: two", { roster, filename: "b.txt" });
t("ids collide across documents", d1.passages[0].id === d2.passages[0].id);
t("refs do not", d1.passages[0].ref !== d2.passages[0].ref,
  `${d1.passages[0].ref} vs ${d2.passages[0].ref}`);
t("ref is fingerprint/id",
  d1.passages[0].ref === d1.source.fingerprint + "/" + d1.passages[0].id);
t("every passage carries a ref", d1.passages.every(p => p.ref));

console.log("\nstaleness is derived from the inputs");
/* Mirrors what both pages do: fingerprint the inputs when the result is built,
   compare on every render. A new input path is covered without being patched. */
const sig = (text, rosterText, workshop) => fingerprint([text, rosterText, workshop].join("\u0000"));
const built = sig(TXT, ROSTER, "W-049");
t("unchanged inputs are not stale", sig(TXT, ROSTER, "W-049") === built);
t("a different roster is stale", sig(TXT, ROSTER + "\nNew Person, Observer", "W-049") !== built);
t("a roster loaded from a file is stale", sig(TXT, "name, designation\nA, B", "W-049") !== built);
t("the sample roster is stale", sig(TXT, "name, designation\nMaria Torres, Facilitator", "W-049") !== built);
t("a different workshop ref is stale", sig(TXT, ROSTER, "W-050") !== built);
t("a different transcript is stale", sig(TXT + "\n[10:00] Maria Torres: more", ROSTER, "W-049") !== built);
t("whitespace in the roster still counts", sig(TXT, ROSTER + " ", "W-049") !== built);

console.log("\nrepeatability");
const s2 = structure(TXT, { roster, filename: "t.txt", workshop: "W-049" });
t("same fingerprint", s.source.fingerprint === s2.source.fingerprint);
t("same ids for same text", s.passages.map(p => p.id).join() === s2.passages.map(p => p.id).join());

console.log("\nissues and state");
t("every unconfirmed speaker raises an issue",
  s.issues.filter(i => i.type === "speaker").length === 4,
  String(s.issues.filter(i => i.type === "speaker").length));
t("state names the unresolved items", /unresolved/.test(s.state), s.state);
const clean = structure("[09:00] Maria Torres: All good.", { roster, filename: "c.txt" });
t("a clean transcript is simply prepared", clean.state === "prepared" && clean.issues.length === 0, clean.state);

console.log("\nno classification happens here");
t("no records produced", !("records" in s) && !("findings" in s));
t("passages carry text only, not kinds", s.passages.every(p => !("kind" in p)));

console.log("\n" + (fail ? fail + " FAILED" : "ALL PASS"));
process.exit(fail ? 1 : 0);
