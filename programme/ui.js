const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const T = totals(), KINDS = byKind(), OWNERS = byOwner(), WS = workshopRows(), COV = coverage();

const LENS = {
  steering: {
    note: "Steering view. What this committee is being asked to settle, and progress against plan. " +
          "Delivery mechanics are not shown.",
    foot: "Every figure on this page is counted from the " + T.records + " records in the register. " +
          "In the product each opens the workshop passage that produced it."
  },
  lead: {
    note: "Programme lead view. Everything, including the review queue and archetype coverage.",
    foot: "Blocked records are the number that matters. Nothing moves until the fields named against " +
          "each record are supplied by its owner."
  },
  sponsor: {
    note: "Client view. Progress on your programme and what is outstanding with your people. " +
          "Our internal delivery figures are not shown here.",
    foot: "Outstanding items sit with named roles in your organisation. In the product each opens " +
          "the record and the passage it came from."
  },
};

const fig = (n,l,s,warn) =>
  `<div class="fig${warn?" warn":""}"><div class="n">${n}</div><div class="l">${l}</div>${
    s?`<div class="s">${s}</div>`:""}</div>`;

function headline(lens){
  const pct = Math.round(T.ready/T.records*100);
  if(lens==="steering") return `<section><div class="figures">
    ${fig(`${T.workshopsDone} of ${T.workshopsTotal}`,"workshops held",`week ${PROGRAMME.weeksElapsed} of ${PROGRAMME.weeksPlanned}`)}
    ${fig(T.records,"records captured","typed, evidenced, analyst-reviewed")}
    ${fig(`${pct}%`,"complete enough to sign off",`${T.blocked} still blocked`,pct<70)}
    ${fig(T.openQuestions,"questions unanswered","each blocking design work",true)}
  </div></section>`;
  if(lens==="sponsor") return `<section><div class="figures">
    ${fig(`${T.workshopsDone} of ${T.workshopsTotal}`,"workshops held",`next: ${WS.find(w=>w.state==="scheduled").date}`)}
    ${fig(T.records,"records captured","from your sessions")}
    ${fig(T.clientBlocked,"items awaiting your people","by role, below",true)}
    ${fig(T.oldestDays,"days, oldest outstanding item","with one role",true)}
  </div></section>`;
  return `<section><div class="figures">
    ${fig(`${T.workshopsDone}/${T.workshopsTotal}`,"workshops processed",`week ${PROGRAMME.weeksElapsed} of ${PROGRAMME.weeksPlanned}`)}
    ${fig(T.records,"records",`ready ${T.ready} · blocked ${T.blocked}`)}
    ${fig(T.queue,"in the review queue","not counted above",T.queue>10)}
    ${fig(T.gaps,"archetypes with no workshop",`of ${COV.length}`,T.gaps>0)}
  </div></section>`;
}

const kinds = () => `<section><h2>Records by kind</h2>
  <p class="lead">A record is ready when every field its kind requires has been supplied. Most
  blockers are fields nobody stated in the session; a reviewer supplies them, they are never inferred.</p>
  <div class="scroll"><table><thead><tr><th>Kind</th><th class="num">Total</th><th class="num">Ready</th>
    <th class="num">Blocked</th><th style="width:150px"></th><th>Waiting on</th></tr></thead>
  <tbody>${KINDS.map(k=>`<tr><td>${k.kind}</td><td class="num">${k.total}</td>
    <td class="num ok">${k.ready}</td><td class="num ${k.blocked?"bad":""}">${k.blocked}</td>
    <td><span class="bar2"><i class="r" style="width:${k.ready/k.total*100}%"></i>
        <i class="b" style="width:${k.blocked/k.total*100}%"></i></span></td>
    <td style="font-size:13px;color:var(--mute)">${esc(k.blockers)}</td></tr>`).join("")}
  </tbody></table></div></section>`;

function owners(lens){
  const rows = lens==="sponsor" ? OWNERS.filter(o=>o.side==="client") : OWNERS;
  return `<section><h2>${lens==="sponsor"?"Outstanding with your people":"Blocked records by owner"}</h2>
  <p class="lead">${lens==="sponsor"
    ? "Each needs a field supplied, a question answered or an approval given."
    : "Age is the oldest outstanding item for that role."}</p>
  <div class="scroll"><table><thead><tr><th>Role</th>${lens!=="sponsor"?"<th>Side</th>":""}
    <th class="num">Blocked</th><th class="num">Oldest</th><th>Subjects</th></tr></thead>
  <tbody>${rows.map(o=>`<tr>
    <td><button class="rolebtn" data-role="${esc(o.role)}" aria-controls="action">${esc(o.role)}</button>
        <span class="sub">prepare an instruction</span></td>
    ${lens!=="sponsor"?`<td style="font-size:13px;color:var(--mute)">${o.side}</td>`:""}
    <td class="num ${o.count>8?"bad":""}">${o.count}</td>
    <td class="num ${o.oldestDays>30?"bad":""}">${o.oldestDays}d</td>
    <td style="font-size:13px;color:var(--body)">${esc(o.subjects)}</td></tr>`).join("")}
  </tbody></table></div>
  ${T.unassigned?`<p class="lead" style="margin-top:12px">
    <span class="bad">${T.unassigned} records have no owner at all</span>${lens==="sponsor"
      ?", so they are not counted against any role above":""}. Nobody was named in the session and no
    reviewer has assigned one. They are invisible to everyone until someone is.</p>`:""}
  </section>`;
}

const workshops = lens => `<section><h2>Workshops</h2>
  <div class="scroll"><table><thead><tr><th>Ref</th><th>Subject</th><th>Region</th><th>Date</th>
    <th class="num">Records</th>${lens!=="sponsor"?'<th class="num">Open questions</th>':""}
    <th>Status</th></tr></thead>
  <tbody>${WS.map(w=>`<tr>
    <td class="mono" style="font-size:12.5px">${w.id}</td><td>${esc(w.title)}</td>
    <td style="font-size:13px;color:var(--mute)">${w.region}</td>
    <td class="mono" style="font-size:12.5px">${w.date}</td>
    <td class="num">${w.records||"—"}</td>
    ${lens!=="sponsor"?`<td class="num ${w.questions?"warnx":""}">${w.questions||"—"}</td>`:""}
    <td style="font-size:13px" class="${w.state==="done"?"ok":""}">${w.state}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="lead" style="margin-top:10px">Records shown are analyst-reviewed. ${T.queue} further
  ${T.queue===1?"candidate is":"candidates are"} in the review queue and counted nowhere above.</p>
  </section>`;

const archetypes = () => `<section><h2>Entity archetype coverage</h2>
  <p class="lead">${PROGRAMME.entities} entities reduced to ${COV.length} patterns. A gap means no
  workshop has covered how those entities are treated.</p>
  <div class="scroll"><table><thead><tr><th>Archetype</th><th class="num">Entities</th>
    <th>Coverage</th><th>Evidence</th></tr></thead>
  <tbody>${COV.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${c.entities}</td>
    <td><span class="pill ${c.status==="covered"?"":c.status}">${c.status}</span></td>
    <td style="font-size:13px;color:var(--mute)">${esc(c.note)}</td></tr>`).join("")}
  </tbody></table></div></section>`;

const queue = () => `<section><h2>Review queue</h2>
  <p class="lead">Extractions waiting on a human to accept, edit or reject. Nothing here counts
  towards any figure above until it has been reviewed.</p>
  <div class="scroll"><table><thead><tr><th>Analyst</th><th class="num">Waiting</th><th>Position</th></tr></thead>
  <tbody>${ANALYST_QUEUE.map(([who,n,note])=>`<tr><td>${esc(who)}</td>
    <td class="num ${n>10?"bad":n?"":"ok"}">${n||"—"}</td>
    <td style="font-size:13px;color:var(--body)">${esc(note)}</td></tr>`).join("")}
  </tbody></table></div></section>`;

/* ---- prepare an instruction ---- */
let ACTION = { role: null };
const NOTES = {};
const noteFor = r => NOTES[r] || "";

function mailBody(role, recs, note){
  return [`${role},`, "",
    note.trim() || "The records below are outstanding with you.", "",
    ...recs.flatMap(r => [`${r.id}  (${r.kind})`, `   ${r.statement}`,
      `   outstanding: ${r.blockers.join(", ")}`, ""]),
    `From the ${PROGRAMME.client} ${PROGRAMME.name} register (${PROGRAMME.ref}).`].join("\n");
}

const instructionFor = (role, recs) =>
  `Draft a notification to the ${role} on ${PROGRAMME.ref} for records `
  + recs.map(r=>r.id).join(", ")
  + (noteFor(role).trim() ? `.\nContext for you when you review the draft: ${noteFor(role).trim()}` : ".");

function actionPanel(){
  const role = ACTION.role;
  if(!role) return "";
  const recs = blockedFor(role), o = OWNERS.find(x=>x.role===role);
  const to = o?.email || "";
  const subject = `${PROGRAMME.client}: ${recs.length} record${recs.length===1?"":"s"} outstanding with you`;
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`
             + `&body=${encodeURIComponent(mailBody(role, recs, noteFor(role)))}`;
  return `<section id="action">
    <h2>Prepare an instruction — ${esc(role)}</h2>
    <p class="lead">${o?`${o.count} blocked, oldest ${o.oldestDays} days.`:""}
    Nothing is sent from this page. It prepares two things: a message in your own mail application,
    or an instruction for ARQON to draft from the register with evidence attached.</p>
    ${recs.length?`<div class="scroll"><table><thead><tr><th>Record</th><th>Kind</th>
      <th>Statement</th><th>Outstanding</th><th>Evidence</th></tr></thead><tbody>
      ${recs.map(r=>`<tr><td class="mono" style="font-size:12.5px">${r.id}</td>
        <td style="font-size:13px;color:var(--mute)">${r.kind}</td><td>${esc(r.statement)}</td>
        <td style="font-size:13px" class="warnx">${esc(r.blockers.join(", "))}</td>
        <td class="mono" style="font-size:12px;color:var(--faint)">${r.workshop} ${r.passages.join(", ")}</td>
        </tr>`).join("")}</tbody></table></div>`
     : `<p class="lead">No blocked records against this role.</p>`}
    <div class="compose">
      <label for="note">Your instruction — optional. Included verbatim in the mail message; passed to
      the analyst as context for the ARQON route.</label>
      <textarea id="note" placeholder="e.g. We need these before the design review on the 14th.">${esc(noteFor(role))}</textarea>
      <div class="acts">
        <a class="btn" href="${href}">Open in email app</a>
        <button class="btn ghost" data-copy="1">Copy instruction for ARQON</button>
        <button class="link" data-close="1">Close</button>
      </div>
      <pre class="inst" id="inst">${esc(instructionFor(role, recs))}</pre>
      <p class="caveat"><strong>What each does.</strong> “Open in email app” hands the text to
      whatever mail application this machine is set to use. It composes a message; it creates no draft
      here and logs nothing. Your note is included verbatim.<br><br>
      The ARQON instruction is for the analyst to paste into the register. The draft it produces uses
      a fixed server-side template and cites the workshop passage behind every record — which is why
      <strong>your note is carried as context for the analyst, not inserted into that email</strong>.
      Both leave the sending to a person.</p>
    </div></section>`;
}

let CURRENT = "lead";

function render(lens){
  /* The importer is a tool, not a lens: it shows no programme figures and
     contributes none. Kept on the same page so the lead has one place to work. */
  if(lens === "import"){
    document.getElementById("client").textContent = `${PROGRAMME.client} · ${PROGRAMME.name}`;
    document.getElementById("ref").textContent = `${PROGRAMME.ref} · tool`;
    document.querySelectorAll(".lens button").forEach(b=>b.classList.toggle("on", b.dataset.lens==="import"));
    document.getElementById("main").innerHTML = importView();
    document.getElementById("foot").textContent =
      "Structuring a transcript produces no records. Classification runs separately, and its output " +
      "is reviewed by an analyst before it counts towards anything on the other views.";
    bindImport();
    return;
  }
  document.getElementById("client").textContent = `${PROGRAMME.client} · ${PROGRAMME.name}`;
  document.getElementById("ref").textContent = `${PROGRAMME.ref} · ${PROGRAMME.phase} phase`;
  document.querySelectorAll(".lens button").forEach(b=>b.classList.toggle("on", b.dataset.lens===lens));
  const parts = [`<p class="lensnote">${LENS[lens].note}</p>`, headline(lens)];
  if(lens==="steering") parts.push(kinds(), owners(lens), actionPanel(), workshops(lens));
  if(lens==="sponsor")  parts.push(owners(lens), actionPanel(), workshops(lens));
  if(lens==="lead")     parts.push(queue(), owners(lens), actionPanel(), kinds(), archetypes(), workshops(lens));
  if(!T.reconciled)
    parts.push(`<p class="lensnote" style="border-color:#9f1239;background:#fff1f2;color:#881337">
      Figures on this page do not reconcile to the underlying records. Do not rely on them.</p>`);
  document.getElementById("main").innerHTML = parts.join("");
  document.getElementById("foot").textContent = LENS[lens].foot;
}

document.addEventListener("click", e=>{
  const lensBtn = e.target.closest("[data-lens]");
  if(lensBtn){ CURRENT = lensBtn.dataset.lens; ACTION = {role:null}; render(CURRENT); return; }
  if(e.target.closest("[data-close]")){ ACTION = {role:null}; render(CURRENT); return; }
  if(e.target.closest("[data-copy]")){
    const text = document.getElementById("inst").textContent;
    navigator.clipboard?.writeText(text).then(
      ()=>{ e.target.textContent="Copied"; setTimeout(()=>{e.target.textContent="Copy instruction for ARQON";},1600); },
      ()=>{});
    return;
  }
  const roleBtn = e.target.closest("button[data-role]");
  if(roleBtn){
    ACTION = { role: roleBtn.dataset.role };
    render(CURRENT);
    document.getElementById("action")?.scrollIntoView({behavior:"smooth",block:"start"});
    document.getElementById("note")?.focus();
  }
});

document.addEventListener("input", e=>{
  if(e.target.id!=="note") return;
  NOTES[ACTION.role] = e.target.value;
  const recs = blockedFor(ACTION.role);
  const inst = document.getElementById("inst");
  if(inst) inst.textContent = instructionFor(ACTION.role, recs);
  const link = document.querySelector("#action a.btn");
  if(link){
    const o = OWNERS.find(x=>x.role===ACTION.role);
    const subject = `${PROGRAMME.client}: ${recs.length} record${recs.length===1?"":"s"} outstanding with you`;
    link.href = `mailto:${encodeURIComponent(o?.email||"")}?subject=${encodeURIComponent(subject)}`
              + `&body=${encodeURIComponent(mailBody(ACTION.role, recs, noteFor(ACTION.role)))}`;
  }
});

render(CURRENT);
