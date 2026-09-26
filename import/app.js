const SAMPLE_TRANSCRIPT = `[09:04] Maria Torres: Right, currency translation and ownership. What rate do the entities use today?
[09:05] Hui Lim: Closing rate for balance sheet, average for P&L. That's been the policy as long as I've been here.
[09:06] Dele Ahmed: It's in the policy document. Though three entities have been using period-end for revenue, and nobody picked it up until last year's audit.
[09:07] Maria Torres: Which three?
[09:07] Dele Ahmed: Singapore, Malaysia, and I think Vietnam. I'd have to check Vietnam.
[09:09] Unidentified speaker: We fixed Vietnam in March.
[09:10] Hui Lim: That was probably Wei on the line. Vietnam was corrected, I believe.
[09:12] Sade Okonjo: Going forward the system must apply closing rate to balance sheet accounts and average rate to income statement accounts, with no local override.
[09:13] Dele Ahmed: Agreed. And we need an exception route for the hyperinflationary entities, because IAS 29 doesn't work that way.
[09:14] Sade Okonjo: Turkey and Argentina. Those restate first and then translate at closing.
[09:18] Group controller (D. Ahmed): The ownership register comes from legal as a quarterly extract.
[09:22] J. Novak: We looked at that last year and parked it.
[09:25] Accounting policy lead (uncertain): Monthly won't help if the effective date isn't carried.`;

const SAMPLE_ROSTER = `name, designation
Maria Torres, Facilitator
Hui Lim, "Regional finance lead, APAC"
Dele Ahmed, Group controller
Sade Okonjo, Accounting policy lead`;

let transcriptText = "", structured = null, rosterErrors = [], builtFrom = null;

/* Staleness is derived from the inputs, not flagged by each handler — flagging
   left an old result downloadable on any path nobody remembered to patch. */
const inputSignature = () =>
  fingerprint([transcriptText, $("roster").value || "", $("wref").value || ""].join("\u0000"));
const isStale = () => !!structured && builtFrom !== inputSignature();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ready(){
  $("go").disabled = !transcriptText.trim();
  $("status").textContent = transcriptText.trim()
    ? `${transcriptText.split(/\r?\n/).filter(l => l.trim()).length} non-empty lines loaded`
    : "";
}

function readFile(file, then){
  const fr = new FileReader();
  fr.onload = () => then(fr.result, file.name);
  fr.onerror = () => { $("status").textContent = "Could not read that file."; };
  fr.readAsText(file, "utf-8");
}

$("tfile").addEventListener("change", e => {
  const f = e.target.files[0];
  if (f) readFile(f, (text, name) => { transcriptText = text; $("tfile").dataset.name = name;
                                      ready(); markStale(); });
});
$("rfile").addEventListener("change", e => {
  const f = e.target.files[0];
  if (f) readFile(f, (text) => { $("roster").value = text; markStale(); });
});
$("sample").addEventListener("click", () => {
  transcriptText = SAMPLE_TRANSCRIPT; $("tfile").dataset.name = "sample-session.txt";
  $("wref").value = $("wref").value || "W-049"; ready(); markStale();
  $("status").textContent += " — sample";
});
$("rsample").addEventListener("click", () => { $("roster").value = SAMPLE_ROSTER; markStale(); });

function showRosterErrors(){
  $("rerr").innerHTML = rosterErrors.length
    ? `<div class="err"><strong>${rosterErrors.some(e=>/listed twice/.test(e))
        ? "Roster rejected — nothing was structured."
        : "Rows skipped. Speakers in them will not resolve."}</strong><br>${
        rosterErrors.map(esc).join("<br>")}</div>`
    : "";
}

/* Editing the roster or the reference makes an existing result wrong: it would
   export the assignments from before the edit. Withhold the export until it is
   rebuilt. */
function markStale(){
  const stale = isStale();
  const s = $("stale"); if (s) s.className = stale ? "err" : "hide";
  ["dl","cp"].forEach(id => { const b = $(id); if (b) b.disabled = stale; });
}
/* Every input that the result depends on, including the ones added later. */
["roster","wref"].forEach(id => $(id).addEventListener("input", markStale));

$("go").addEventListener("click", () => {
  const { roster, errors } = parseRoster($("roster").value || "");
  rosterErrors = errors;
  showRosterErrors();
  /* A roster that contradicts itself is worse than none: it would resolve a
     speaker cleanly and wrongly. */
  if (errors.some(e => /listed twice/.test(e))) return;

  structured = structure(transcriptText, {
    roster,
    filename: $("tfile").dataset.name || "pasted.txt",
    workshop: $("wref").value.trim(),
  });
  builtFrom = inputSignature();
  renderResult();
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderResult(){
  const s = structured;
  const counts = {};
  s.passages.forEach(p => {
    const k = p.parse === "unparsed" ? "unparsed" : p.speaker.certainty;
    counts[k] = (counts[k] || 0) + 1;
  });
  const confirmed = counts.confirmed || 0;

  $("result").className = "";
  $("result").innerHTML = `
  <section>
    <h2>2 · Structure</h2>
    <p class="lead">Transcript prepared for extraction. ${s.passages.length} passages, fingerprint
      <span class="mono">${esc(s.source.fingerprint)}</span>. The same file always produces the same
      passage IDs, so a record can cite one and still resolve later.</p>
    <div class="figures">
      <div class="fig"><div class="n">${s.passages.length}</div><div class="l">passages</div></div>
      <div class="fig"><div class="n">${confirmed}</div>
        <div class="l">passages with a confirmed speaker</div></div>
      <div class="fig${s.passages.length - confirmed ? " warn" : ""}">
        <div class="n">${s.passages.length - confirmed}</div><div class="l">passages without one</div></div>
      <div class="fig${s.issues.length ? " warn" : ""}"><div class="n">${s.issues.length}</div>
        <div class="l">items for review</div></div>
    </div>
  </section>

  ${s.issues.length ? `<section>
    <h2>3 · Items for review</h2>
    <p class="lead">Nothing here is guessed. A passage whose speaker is not confirmed cannot support
      a decision, because a decision depends on who holds authority over the subject.</p>
    <div class="scroll"><table><thead><tr><th>Type</th><th>Subject</th><th>Why</th><th>Passages</th></tr></thead>
    <tbody>${s.issues.map(i => `<tr>
      <td><span class="tag ${esc(i.certainty || "unparsed")}">${esc(i.certainty || "unparsed line")}</span></td>
      <td>${esc(i.speaker || i.passage)}</td>
      <td style="color:var(--body)">${esc(i.detail)}</td>
      <td class="mono" style="font-size:12px;color:var(--faint)">${esc((i.passages || [i.passage]).join(" "))}</td>
    </tr>`).join("")}</tbody></table></div>
  </section>` : ""}

  <section>
    <h2>${s.issues.length ? "4" : "3"} · Original and parsed</h2>
    <p class="lead">Left, the file as supplied. Right, what was made of it. Nothing was rewritten.</p>
    <div class="side">
      <div><h3 style="font-size:13px;color:var(--mute);margin:0 0 8px">Source — ${esc(s.source.filename)}</h3>
        <pre class="out">${esc(transcriptText)}</pre></div>
      <div><h3 style="font-size:13px;color:var(--mute);margin:0 0 8px">Passages</h3>
        <div class="panel">${s.passages.map(p => `<div class="psg">
          <div class="m"><span class="pid mono">${p.id}</span>
            ${p.time ? `<span class="pid mono">${esc(p.time)}</span>` : ""}
            ${p.parse === "unparsed"
              ? `<span class="tag unparsed">unparsed line</span>`
              : `<span class="tag ${esc(p.speaker.certainty)}">${esc(p.speaker.certainty)}</span>
                 <span style="color:var(--body)">${esc(p.speaker.designation || p.speaker.raw)}</span>`}
          </div><p>${esc(p.text)}</p></div>`).join("")}</div></div>
    </div>
  </section>

  <section>
    <h2>${s.issues.length ? "5" : "4"} · Export</h2>
    <p class="lead">Versioned JSON (<span class="mono">${esc(s.schema)}</span>) carrying source
      metadata, passages, speaker resolution and everything unresolved. Passage IDs are unique
      within this document only, so every passage also carries
      <span class="mono">${esc(s.source.fingerprint)}/P-00n</span> for anything that cites it.
      This is the input to classification — which runs elsewhere, produces records, and puts them in an analyst's queue
      before they count towards anything.</p>
    <div id="stale" class="hide">The roster or workshop reference changed after this was
      structured. Export is withheld — press “Structure the transcript” again.</div>
    <div class="row">
      <button class="btn" id="dl">Download JSON</button>
      <button class="btn ghost" id="copy">Copy JSON</button>
      <span style="font-size:13px;color:var(--mute)">state: ${esc(s.state)}</span>
    </div>
    <pre class="out" style="margin-top:14px">${esc(JSON.stringify(s, null, 2).slice(0, 2600))}${
      JSON.stringify(s).length > 2600 ? "\n… truncated for display; the download is complete" : ""}</pre>
  </section>`;

  $("dl").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(structured, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (structured.source.workshop || "transcript") + "-structured.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("copy").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(JSON.stringify(structured, null, 2)).then(() => {
      e.target.textContent = "Copied";
      setTimeout(() => { e.target.textContent = "Copy JSON"; }, 1500);
    }, () => {});
  });
}

ready();
