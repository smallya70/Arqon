/* Message bodies. Server-side templates only: the model chooses a template and
   an audience, never the wording and never a recipient.

   Every value interpolated here comes from the register. Record text is escaped
   and rendered as quoted content, never as instruction — a transcript can
   contain a sentence addressed to an agent, and it must stay inert. */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const P = (s) => `<p style="margin:0 0 12px">${s}</p>`;

function recordBlock(r, evidence, registerUrl) {
  const blockers = JSON.parse(r.blockers || "[]");
  const ev = evidence
    .map((e) => `${esc(e.passage_id)} — ${esc(e.speaker)}: &ldquo;${esc(e.quote)}&rdquo;`)
    .join("<br>");
  return `
  <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
    <tr><td style="border-left:3px solid #0f172a;padding:0 0 0 12px">
      <div style="font:12px/1.4 monospace;color:#64748b">${esc(r.id)} · ${esc(r.kind)}${
        r.type && r.type !== "n/a" ? " · " + esc(r.type) : ""}</div>
      <div style="font-size:15px;margin:4px 0 8px">${esc(r.statement)}</div>
      <div style="font-size:12px;color:#64748b">Evidence from the session:<br>${ev || "none linked"}</div>
      ${blockers.length
        ? `<div style="font-size:12px;color:#92400e;margin-top:6px">Outstanding: ${
            blockers.map(esc).join(", ")}</div>`
        : ""}
      <div style="font-size:12px;margin-top:8px"><a href="${esc(registerUrl)}/record/${
        encodeURIComponent(r.id)}">Open in the register</a></div>
    </td></tr>
  </table>`;
}

export const TEMPLATES = {
  approval_request: {
    audienceHint: "the role with authority over the subject",
    subject: (ctx) =>
      `${ctx.programmeName}: ${ctx.records.length} record${ctx.records.length === 1 ? "" : "s"} awaiting your approval`,
    intro: (ctx) =>
      P(`${esc(ctx.recipientName)},`) +
      P(`The records below were captured in workshop ${esc(ctx.workshopRef)} and have passed analyst review as accurate captures of what was said. They now need your decision on whether they are right for the design.`) +
      P(`Each links to the register, where the transcript passage that produced it is one click away.`),
  },
  answer_request: {
    audienceHint: "the person who owns the open question",
    subject: (ctx) => `${ctx.programmeName}: ${ctx.records.length} open question${ctx.records.length === 1 ? "" : "s"} for you`,
    intro: (ctx) =>
      P(`${esc(ctx.recipientName)},`) +
      P(`These questions came out of workshop ${esc(ctx.workshopRef)} unresolved. They need an answer rather than an approval — design work downstream is waiting on them.`),
  },
  action_reminder: {
    audienceHint: "the person who owns the action",
    subject: (ctx) => `${ctx.programmeName}: ${ctx.records.length} action${ctx.records.length === 1 ? "" : "s"} outstanding`,
    intro: (ctx) =>
      P(`${esc(ctx.recipientName)},`) +
      P(`Actions recorded against you in workshop ${esc(ctx.workshopRef)}, still open.`),
  },
  workshop_playback: {
    audienceHint: "a participant of the workshop",
    subject: (ctx) => `${ctx.programmeName}: what we captured from ${ctx.workshopRef}`,
    intro: (ctx) =>
      P(`${esc(ctx.recipientName)},`) +
      P(`This is what we recorded from workshop ${esc(ctx.workshopRef)}. Please correct anything that misrepresents what was said — the statements are meant to be a faithful capture, not an interpretation.`),
  },
};

export function render(templateKey, ctx) {
  const t = TEMPLATES[templateKey];
  if (!t) throw new Error(`Unknown template: ${templateKey}`);
  const body =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">` +
    t.intro(ctx) +
    ctx.records.map((r) => recordBlock(r, ctx.evidence[r.id] || [], ctx.registerUrl)).join("") +
    P(`<span style="font-size:12px;color:#64748b">Sent from the ARQON register for ${esc(ctx.programmeName)}. Drafted by ${esc(ctx.requestedBy)}.</span>`) +
    `</div>`;
  return { subject: t.subject(ctx), html: body };
}
