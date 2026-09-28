#!/usr/bin/env node
// extract.js — automates the manual step: prompt.txt -> Claude API -> reply -> ingest.
// Zero dependencies (Node 22+: fetch, crypto, fs, child_process).
//
// The tool never edits the model's output. It saves the raw API response and the
// reply text exactly as returned, records what it observed, then hands the reply to
// the existing `arqon.js ingest`, which does all validation. Nothing is approved or sent.
//
//   export ANTHROPIC_API_KEY=...          (never written to disk or logged)
//   node extract.js --prompt prompt.txt --workshop W-049 \
//     --transcript ../w049/W049-reference.json --model claude-opus-5-5 \
//     --prompt-version 2 --label development_retest
//
// Options: --max-tokens N (default 16000)  --no-ingest  --out DIR (default .arqon/runs)

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const API_BASE = process.env.ARQON_API_BASE || 'https://api.anthropic.com';
const ARQON_CLI = process.env.ARQON_CLI || path.join(__dirname, 'arqon.js');
const LABELS = ['development_retest', 'held_out_evaluation', 'smoke_test'];

function fail(msg, code = 1) { console.error('extract: ' + msg); process.exit(code); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseArgs(argv) {
  const a = { maxTokens: 16000, ingest: true, out: '.arqon/runs' };
  const need = (i) => { if (i >= argv.length) fail('missing value for ' + argv[i - 1]); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--prompt') a.prompt = need(++i);
    else if (k === '--workshop') a.workshop = need(++i);
    else if (k === '--transcript') a.transcript = need(++i);
    else if (k === '--model') a.model = need(++i);
    else if (k === '--prompt-version') a.promptVersion = need(++i);
    else if (k === '--label') a.label = need(++i);
    else if (k === '--max-tokens') a.maxTokens = Number(need(++i));
    else if (k === '--out') a.out = need(++i);
    else if (k === '--no-ingest') a.ingest = false;
    else fail('unknown option ' + k);
  }
  for (const r of ['prompt', 'workshop', 'model', 'promptVersion', 'label'])
    if (!a[r]) fail('--' + r.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ' is required');
  if (a.ingest && !a.transcript) fail('--transcript is required unless --no-ingest');
  if (!LABELS.includes(a.label)) fail('--label must be one of: ' + LABELS.join(', '));
  if (!Number.isInteger(a.maxTokens) || a.maxTokens < 1) fail('--max-tokens must be a positive integer');
  return a;
}

// Refuse prompts that cannot produce a measurable run (the failure seen on W-049 run 1:
// a paste with the transcript but no contract).
function checkPrompt(text, workshop) {
  const missing = [];
  if (!/OUTPUT SCHEMA:\s*arqon\.candidates\//.test(text)) missing.push('OUTPUT SCHEMA line');
  if (!/RECORD KINDS/.test(text)) missing.push('RECORD KINDS');
  if (!/REQUIRED FIELDS BY KIND/.test(text)) missing.push('REQUIRED FIELDS BY KIND');
  if (!/TRANSCRIPT \(document /.test(text)) missing.push('TRANSCRIPT block');
  if (!text.includes('WORKSHOP: ' + workshop)) missing.push('WORKSHOP: ' + workshop);
  return missing;
}

async function callApi(prompt, a, key) {
  const res = await fetch(API_BASE + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: a.model, max_tokens: a.maxTokens, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const bodyText = await res.text();
  return { status: res.status, requestId: res.headers.get('request-id'), bodyText };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) fail('ANTHROPIC_API_KEY is not set');

  let prompt;
  try { prompt = fs.readFileSync(a.prompt, 'utf8'); } catch (e) { fail('cannot read prompt: ' + e.message); }
  const missing = checkPrompt(prompt, a.workshop);
  if (missing.length) fail('prompt is incomplete, missing: ' + missing.join(', '));

  const startedAt = new Date().toISOString();
  const runId = a.workshop + '-' + startedAt.replace(/[:.]/g, '-');
  const dir = path.join(a.out, runId);
  fs.mkdirSync(dir, { recursive: true });

  const run = {
    schema: 'arqon.run/1', runId, workshop: a.workshop, runLabel: a.label,
    contextCondition: 'fresh_api_single_turn',
    promptFile: a.prompt, promptVersion: a.promptVersion, promptSha256: sha256(prompt),
    provider: 'anthropic-api', modelRequested: a.model, maxTokens: a.maxTokens,
    attestation: 'request and response observed by the tool',
    startedAt,
  };
  const save = () => fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n');

  let r;
  try { r = await callApi(prompt, a, key); }
  catch (e) { run.error = 'request failed: ' + e.message; run.finishedAt = new Date().toISOString(); save(); fail(run.error + ' (see ' + dir + ')', 2); }

  run.finishedAt = new Date().toISOString();
  run.httpStatus = r.status;
  run.requestId = r.requestId;
  fs.writeFileSync(path.join(dir, 'api-response.json'), r.bodyText); // untouched

  if (r.status < 200 || r.status > 299) { run.error = 'API returned HTTP ' + r.status; save(); fail(run.error + ' (body saved in ' + dir + ')', 2); }

  let body;
  try { body = JSON.parse(r.bodyText); } catch { run.error = 'API body is not JSON'; save(); fail(run.error, 2); }
  run.modelReturned = body.model || null;
  run.stopReason = body.stop_reason || null;
  run.usage = body.usage || null;

  // Reply text exactly as returned: text blocks concatenated, nothing stripped or repaired.
  const reply = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const replyPath = path.join(dir, 'reply.json');
  fs.writeFileSync(replyPath, reply);
  run.replySha256 = sha256(reply);
  run.warnings = [];
  if (run.stopReason === 'max_tokens') run.warnings.push('response truncated at max_tokens; expect ingest failures');
  if (!reply.trim()) run.warnings.push('response contained no text');
  if (/^\s*```/.test(reply)) run.warnings.push('response is wrapped in a markdown fence, which the contract forbids; not stripped');
  save();

  console.log('run        ' + runId);
  console.log('model      ' + run.modelReturned + '  stop=' + run.stopReason + '  request=' + run.requestId);
  console.log('saved      ' + dir);
  for (const w of run.warnings) console.log('WARNING    ' + w);
  if (!a.ingest) { console.log('ingest     skipped (--no-ingest)'); return; }

  // Hand over to the existing, tested ingest. It still only accepts a model label,
  // so provenance goes in the label and in run.json until ingest takes --run.
  const label = run.modelReturned + ' | api fresh single-turn | prompt v' + a.promptVersion + ' | ' + a.label + ' | run ' + runId;
  console.log('ingest     node arqon.js ingest ' + replyPath);
  const ing = spawnSync(process.execPath, [ARQON_CLI, 'ingest', replyPath, '--transcript', a.transcript, '--workshop', a.workshop, '--model', label], { stdio: 'inherit' });
  if (ing.error) fail('could not run ingest: ' + ing.error.message, 3);
  process.exit(ing.status === null ? 3 : ing.status);
}

main();
