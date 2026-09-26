/* A findings report a finance lead can read and forward.

   One self-contained HTML file. No template engine, no dependency. Everything
   in it traces to a row of the register — a finding without its evidence is an
   opinion, and this document exists to be argued with. */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CLASS_NOTE = {
  defect: "Determinable from the register alone. These are inconsistent however " +
          "the business is structured, and do not need anyone's opinion to establish.",
  question: "The register is internally consistent but does not hold enough to settle these. " +
            "Each needs a person to confirm or supply what is missing.",
};

export function renderReport({ rows, report, findings, client = "", asAt = new Date() }) {
  const defects = findings.filter(f => f.class === "defect");
  const questions = findings.filter(f => f.class === "question");
  const entities = new Set(rows.filter(r => r.code).map(r => r.code)).size;
  const affected = new Set(findings.map(f => f.entity)).size;

  const block = (f) => `
  <article>
    <div class="fhead">
      <span class="code">${esc(f.code)}</span>
      <span class="ent">${esc(f.entity)}</span>
      <span class="sev ${esc(f.severity)}">${esc(f.severity)}</span>
    </div>
    <p class="msg">${esc(f.message)}</p>
    <table class="ev">
      <thead><tr><th>Sheet</th><th>Row</th><th>Entity as written</th><th>Holding</th>
        <th>From</th><th>To</th><th>Method</th><th>Version</th></tr></thead>
      <tbody>${f.evidence.map(e => `<tr>
        <td>${esc(e.sheet)}</td><td class="n">${esc(e.row)}</td>
        <td>${esc(e.name)}</td><td class="n">${e.pct != null ? esc(e.pct) + "%" : "—"}</td>
        <td>${esc(e.from || "—")}</td><td>${esc(e.to || "—")}</td>
        <td>${esc(e.method || "—")}</td><td>${esc(e.version)}</td></tr>`).join("")}
      </tbody></table>
    <p class="rem">${esc(f.remedy)}</p>
  </article>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ownership register assessment${client ? " — " + esc(client) : ""}</title>
<style>
 :root{--ink:#0f172a;--body:#334155;--mute:#64748b;--faint:#94a3b8;--line:#cbd5e1;
       --hair:#e2e8f0;--page:#fff;--bad:#9f1239;--warn:#b45309}
 *{box-sizing:border-box}
 body{margin:0;background:var(--page);color:var(--ink);
   font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
 .wrap{max-width:880px;margin:0 auto;padding:48px 32px 80px}
 h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px;font-weight:600}
 .sub{color:var(--mute);font-size:14px;margin:0 0 32px}
 .figures{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
   border:1px solid var(--line);margin:0 0 36px}
 .fig{background:#fff;padding:14px 16px}
 .fig .n{font-size:26px;letter-spacing:-.02em}
 .fig .l{font-size:12px;color:var(--mute);margin-top:3px}
 h2{font-size:17px;margin:38px 0 4px}
 .cls{color:var(--body);font-size:14px;margin:0 0 20px;max-width:72ch}
 article{border:1px solid var(--line);margin:0 0 14px}
 .fhead{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--hair);
   background:#fafafa}
 .code{font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--mute)}
 .ent{font-weight:600;font-size:14px}
 .sev{margin-left:auto;font-size:11px;padding:2px 8px;color:#fff;background:var(--warn)}
 .sev.high{background:var(--bad)}
 .msg{margin:14px 16px;font-size:14.5px}
 table.ev{width:calc(100% - 32px);margin:0 16px;border-collapse:collapse;font-size:12.5px}
 table.ev th{text-align:left;color:var(--mute);font-weight:500;padding:5px 8px;
   border-bottom:1px solid var(--line);white-space:nowrap}
 table.ev td{padding:5px 8px;border-bottom:1px solid var(--hair)}
 table.ev td.n,table.ev th.n{text-align:right}
 .rem{margin:14px 16px;padding-left:12px;border-left:2px solid var(--ink);
   font-size:13.5px;color:var(--body)}
 .src{border-top:1px solid var(--line);margin-top:44px;padding-top:20px;
   font-size:13px;color:var(--mute)}
 .src table{border-collapse:collapse;margin-top:10px;font-size:12.5px}
 .src td,.src th{padding:4px 12px 4px 0;text-align:left}
 .none{color:var(--mute);font-size:14px}
 @media print{.wrap{padding:0}article{break-inside:avoid}}
</style></head><body><div class="wrap">

<h1>Ownership register assessment</h1>
<p class="sub">${client ? esc(client) + " · " : ""}${esc(report.file)} · version ${esc(report.version)}
 · assessed ${asAt.toISOString().slice(0, 10)}</p>

<div class="figures">
  <div class="fig"><div class="n">${rows.length}</div><div class="l">ownership rows read</div></div>
  <div class="fig"><div class="n">${entities}</div><div class="l">distinct entity codes</div></div>
  <div class="fig"><div class="n">${defects.length}</div><div class="l">inconsistencies</div></div>
  <div class="fig"><div class="n">${questions.length}</div><div class="l">items needing confirmation</div></div>
</div>

<h2>Inconsistencies in the register</h2>
<p class="cls">${CLASS_NOTE.defect}</p>
${defects.length ? defects.map(block).join("")
  : `<p class="none">None found. The register is internally consistent on every check applied.</p>`}

<h2>Items needing confirmation</h2>
<p class="cls">${CLASS_NOTE.question}</p>
${questions.length ? questions.map(block).join("")
  : `<p class="none">None.</p>`}

<div class="src">
  <strong>What was read</strong>
  <table><tbody>
   ${report.sheets.map(s => `<tr><td>${esc(s.name)}</td><td>${
     s.used ? `header row ${s.headerRow}, ${s.rows} rows`
            : `not used — ${esc(s.why)}`}</td></tr>`).join("")}
  </tbody></table>
  <p>${affected} of ${entities} entities appear in at least one finding. Every finding cites the
  sheet and row it came from, so each can be checked against the source file. Nothing above is
  inferred from outside the register: where the file does not settle a question, it is listed as
  one rather than answered.</p>
</div>
</div></body></html>`;
}
