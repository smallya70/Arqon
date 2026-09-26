/* The transcript importer, as a view inside the programme page.

   Kept structurally separate from everything the programme shows: it produces
   no records, writes nothing into the dataset, and nothing it structures
   appears in any figure. A transcript becomes records only through
   classification and analyst review, neither of which happens here. */

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

/* Roster seeded from the programme's own roles, so the common case needs no typing. */
const rosterFromProgramme = () =>
  "name, designation\n" + ROLES.map(r => `Name of ${r.role}, "${r.role}"`).join("\n");

let IMP = { text: "", filename: "", structured: null, rosterText: "", workshop: "" };

function importView(){
  const s = IMP.structured;
  return `
  <p class="lensnote">Transcript import. Everything runs in this browser — no upload, no network
  request, no credentials. <strong>This structures a transcript; it classifies nothing and creates no
  records.</strong> Nothing here affects any figure on the other views.</p>

  <section><h2>1 · Load</h2>
    <div class="impgrid">
      <div class="box">
        <h3>Transcript</h3>
        <p>A UTF-8 .txt file, one turn per line, as
          <span class="mono">[hh:mm] Speaker: what they said</span>. The timestamp is optional.</p>
        <input type="file" id="tfile" accept=".txt,text/plain">
        <div class="acts"><button class="link" id="sample">load a sample transcript</button></div>
      </div>
      <div class="box">
        <h3>Speaker roster</h3>
        <p>One per line: <span class="mono">name, designation</span>. Quote a designation containing a
          comma. A name absent from the roster is flagged, never guessed.</p>
        <textarea id="roster" class="rost" placeholder='name, designation&#10;Maria Torres, Facilitator'>${esc(IMP.rosterText)}</textarea>
        <div class="acts">
          <input type="file" id="rfile" accept=".csv,.txt,text/csv,text/plain">
          <button class="link" id="rsample">sample roster</button>
          <button class="link" id="rroles">from programme roles</button>
        </div>
      </div>
    </div>
    <div class="acts" style="margin-top:14px">
      <label style="font-size:13px;color:var(--mute)">Workshop ref
        <input id="wref" value="${esc(IMP.workshop)}" placeholder="W-049"
          style="font:inherit;padding:6px 8px;border:1px solid var(--line);width:110px;margin-left:6px"></label>
      <button class="btn" id="go"${IMP.text.trim() ? "" : " disabled"}>Structure the transcript</button>
      <span id="istatus" style="font-size:13px;color:var(--mute)">${
        IMP.text.trim() ? `${IMP.text.split(/\r?\n/).filter(l=>l.trim()).length} non-empty lines loaded` : ""}</span>
    </div>
    <div id="rerr"></div>
  </section>
  ${s ? resultView(s) : ""}`;
}

function resultView(s){
  const counts = {};
  s.passages.forEach(p => { const k = p.parse === "unparsed" ? "unparsed" : p.speaker.certainty;
                            counts[k] = (counts[k] || 0) + 1; });
  const confirmed = counts.confirmed || 0;
  return `
  <section><h2>2 · Structure</h2>
    <p class="lead">Transcript prepared for extraction. Passage IDs come from position and the file's
      content fingerprint, so the same file always yields the same IDs — a record can cite one and
      still resolve months later.</p>
    <div class="figures">
      <div class="fig"><div class="n">${s.passages.length}</div><div class="l">passages</div></div>
      <div class="fig"><div class="n">${confirmed}</div><div class="l">speakers confirmed</div></div>
      <div class="fig${s.passages.length-confirmed?" warn":""}"><div class="n">${s.passages.length-confirmed}</div>
        <div class="l">passages without a confirmed speaker</div></div>
      <div class="fig${s.issues.length?" warn":""}"><div class="n">${s.issues.length}</div>
        <div class="l">items for review</div></div>
    </div>
  </section>

  ${s.issues.length ? `<section><h2>3 · Items for review</h2>
    <p class="lead">Nothing here is guessed. A passage whose speaker is unconfirmed cannot support a
      decision, because a decision depends on who holds authority over the subject.</p>
    <div class="scroll"><table><thead><tr><th>State</th><th>Subject</th><th>Why</th><th>Passages</th></tr></thead>
    <tbody>${s.issues.map(i=>`<tr>
      <td><span class="tag ${esc(i.certainty||"unparsed")}">${esc(i.certainty||"unparsed line")}</span></td>
      <td>${esc(i.speaker||i.passage)}</td>
      <td style="color:var(--body)">${esc(i.detail)}</td>
      <td class="mono" style="font-size:12px;color:var(--faint)">${esc((i.passages||[i.passage]).join(" "))}</td>
    </tr>`).join("")}</tbody></table></div></section>` : ""}

  <section><h2>${s.issues.length?"4":"3"} · Original and parsed</h2>
    <p class="lead">Left, the file as supplied. Right, what was made of it. Nothing was rewritten.</p>
    <div class="side">
      <div><h3 class="minih">Source — ${esc(s.source.filename)}</h3>
        <pre class="out">${esc(IMP.text)}</pre></div>
      <div><h3 class="minih">Passages</h3><div class="panel">${s.passages.map(p=>`<div class="psg">
        <div class="m"><span class="pid mono">${p.id}</span>
          ${p.time?`<span class="pid mono">${esc(p.time)}</span>`:""}
          ${p.parse==="unparsed"?`<span class="tag unparsed">unparsed line</span>`
            :`<span class="tag ${esc(p.speaker.certainty)}">${esc(p.speaker.certainty)}</span>
              <span style="color:var(--body)">${esc(p.speaker.designation||p.speaker.raw)}</span>`}
        </div><p>${esc(p.text)}</p></div>`).join("")}</div></div>
    </div></section>

  <section><h2>${s.issues.length?"5":"4"} · Export</h2>
    <p class="lead">Versioned JSON (<span class="mono">${esc(s.schema)}</span>) with source metadata,
      passages, speaker resolution and everything unresolved. This is the input to classification,
      which runs separately and puts its records in an analyst's queue before they count anywhere.</p>
    <div class="acts">
      <button class="btn" id="dl">Download JSON</button>
      <button class="btn ghost" id="cp">Copy JSON</button>
      <span style="font-size:13px;color:var(--mute)">state: ${esc(s.state)} · fingerprint
        <span class="mono">${esc(s.source.fingerprint)}</span></span>
    </div>
    <pre class="out" style="margin-top:14px">${esc(JSON.stringify(s,null,2).slice(0,2200))}${
      JSON.stringify(s).length>2200?"\n… truncated for display; the download is complete":""}</pre>
  </section>`;
}

function bindImport(){
  const el = (id) => document.getElementById(id);
  const readFile = (f, then) => { const fr = new FileReader();
    fr.onload = () => then(fr.result, f.name); fr.readAsText(f, "utf-8"); };

  el("tfile")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) readFile(f, (text, name) => { IMP.text = text; IMP.filename = name;
      IMP.structured = null; render(CURRENT); });
  });
  el("rfile")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) readFile(f, text => { IMP.rosterText = text; render(CURRENT); });
  });
  el("sample")?.addEventListener("click", () => {
    IMP.text = SAMPLE_TRANSCRIPT; IMP.filename = "sample-session.txt";
    IMP.workshop = IMP.workshop || "W-049"; IMP.structured = null; render(CURRENT);
  });
  el("rsample")?.addEventListener("click", () => { IMP.rosterText = SAMPLE_ROSTER; render(CURRENT); });
  el("rroles")?.addEventListener("click", () => { IMP.rosterText = rosterFromProgramme(); render(CURRENT); });
  el("roster")?.addEventListener("input", e => { IMP.rosterText = e.target.value; });
  el("wref")?.addEventListener("input", e => { IMP.workshop = e.target.value; });

  el("go")?.addEventListener("click", () => {
    const { roster, errors } = parseRoster(IMP.rosterText || "");
    IMP.workshop = el("wref").value.trim();
    if (errors.length && el("rerr"))
      el("rerr").innerHTML = `<div class="err"><strong>Roster not used as given.</strong><br>${
        errors.map(esc).join("<br>")}</div>`;
    /* A roster contradicting itself would resolve a speaker cleanly and wrongly. */
    if (errors.some(e => /listed twice/.test(e))) return;
    IMP.structured = structure(IMP.text, { roster, filename: IMP.filename || "pasted.txt",
                                           workshop: IMP.workshop });
    render(CURRENT);
    document.querySelector("#main section:nth-of-type(2)")?.scrollIntoView({behavior:"smooth",block:"start"});
  });

  el("dl")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(IMP.structured, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (IMP.structured.source.workshop || "transcript") + "-structured.json";
    a.click(); URL.revokeObjectURL(a.href);
  });
  el("cp")?.addEventListener("click", e => {
    navigator.clipboard?.writeText(JSON.stringify(IMP.structured, null, 2))
      .then(() => { e.target.textContent = "Copied";
        setTimeout(() => { e.target.textContent = "Copy JSON"; }, 1500); }, () => {});
  });
}
