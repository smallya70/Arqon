#!/usr/bin/env node
// test-extract.js — tests extract.js against a local fake API. No key, no tokens spent.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EXTRACT = path.join(__dirname, 'extract.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arqon-extract-'));
const FAKE_KEY = 'sk-test-NEVER-WRITE-ME';
let pass = 0, failures = 0, apiCalls = 0, next = null;

function check(name, cond) { if (cond) pass++; else { failures++; console.log('FAIL ' + name); } }

const GOOD_PROMPT = [
  'OUTPUT SCHEMA: arqon.candidates/2', 'RECORD KINDS', 'Requirement', 'REQUIRED FIELDS BY KIND',
  'WORKSHOP: W-049', 'TRANSCRIPT (document 1df000041775, 1 passages)', '1df000041775/P-001 [09:04] X: hello',
].join('\n');
fs.writeFileSync(path.join(tmp, 'good.txt'), GOOD_PROMPT);
fs.writeFileSync(path.join(tmp, 'bad.txt'), 'WORKSHOP: W-049\nTRANSCRIPT (document 1df000041775, 1 passages)\n');

// Stub ingest records the arguments it was given.
const STUB = path.join(tmp, 'stub-arqon.js');
fs.writeFileSync(STUB, "require('fs').writeFileSync(process.env.STUB_OUT, JSON.stringify(process.argv.slice(2)));\n");
const STUB_OUT = path.join(tmp, 'stub-args.json');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    apiCalls++;
    const { status, payload } = next(JSON.parse(body), req.headers);
    res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_test_1' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
});

function run(args, env = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [EXTRACT, ...args], {
      env: { ...process.env, ANTHROPIC_API_KEY: FAKE_KEY, ARQON_API_BASE: 'http://127.0.0.1:' + server.address().port, ARQON_CLI: STUB, STUB_OUT, ...env },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

const ok = (text, stop = 'end_turn') => () => ({ status: 200, payload: { model: 'claude-opus-5-5', stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text }] } });
const base = (out, extra = []) => ['--prompt', path.join(tmp, 'good.txt'), '--workshop', 'W-049', '--transcript', 't.json', '--model', 'claude-opus-5-5', '--prompt-version', '2', '--label', 'development_retest', '--out', out, ...extra];
const onlyRun = (out) => { const d = fs.readdirSync(out); return path.join(out, d[0]); };
const allText = (dir) => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  // 1. Missing key: refuses, no API call.
  let before = apiCalls;
  let r = await run(base(path.join(tmp, 'o1')), { ANTHROPIC_API_KEY: '' });
  check('missing key exits 1', r.code === 1);
  check('missing key makes no API call', apiCalls === before);

  // 2. Incomplete prompt (transcript without contract): refuses before calling.
  before = apiCalls;
  const a2 = base(path.join(tmp, 'o2')); a2[1] = path.join(tmp, 'bad.txt');
  r = await run(a2);
  check('incomplete prompt exits 1', r.code === 1);
  check('incomplete prompt names what is missing', /OUTPUT SCHEMA/.test(r.out));
  check('incomplete prompt makes no API call', apiCalls === before);

  // 3. Success: request shape, raw preservation, provenance, handover to ingest.
  const REPLY = '{"schema":"arqon.candidates/2","candidates":[]}\n  ';
  let seen;
  next = (b, h) => { seen = { b, h }; return ok(REPLY)(); };
  r = await run(base(path.join(tmp, 'o3')));
  check('success exits with ingest status 0', r.code === 0);
  check('sends prompt as single user message', seen.b.messages.length === 1 && seen.b.messages[0].content === GOOD_PROMPT);
  check('sends requested model', seen.b.model === 'claude-opus-5-5');
  check('sends key only in header', seen.h['x-api-key'] === FAKE_KEY);
  const d3 = onlyRun(path.join(tmp, 'o3'));
  check('reply saved byte-identical, whitespace kept', fs.readFileSync(path.join(d3, 'reply.json'), 'utf8') === REPLY);
  check('raw API response saved', JSON.parse(fs.readFileSync(path.join(d3, 'api-response.json'), 'utf8')).content[0].text === REPLY);
  const run3 = JSON.parse(fs.readFileSync(path.join(d3, 'run.json'), 'utf8'));
  check('run records returned model', run3.modelReturned === 'claude-opus-5-5');
  check('run records request id', run3.requestId === 'req_test_1');
  check('run records prompt version and hash', run3.promptVersion === '2' && /^[0-9a-f]{64}$/.test(run3.promptSha256));
  check('run records label and context', run3.runLabel === 'development_retest' && run3.contextCondition === 'fresh_api_single_turn');
  check('run attests observation', run3.attestation === 'request and response observed by the tool');
  check('API key written nowhere', !allText(d3).includes(FAKE_KEY));
  const args = JSON.parse(fs.readFileSync(STUB_OUT, 'utf8'));
  check('ingest called with saved reply', args[0] === 'ingest' && args[1] === path.join(d3, 'reply.json'));
  check('ingest label carries provenance', /prompt v2/.test(args[args.indexOf('--model') + 1]) && /development_retest/.test(args[args.indexOf('--model') + 1]));

  // 4. Truncated response: saved and flagged, not hidden.
  next = ok('{"schema":"arqon.cand', 'max_tokens');
  r = await run(base(path.join(tmp, 'o4'), ['--no-ingest']));
  const run4 = JSON.parse(fs.readFileSync(path.join(onlyRun(path.join(tmp, 'o4')), 'run.json'), 'utf8'));
  check('truncation exits 0 with --no-ingest', r.code === 0);
  check('truncation flagged', run4.warnings.some((w) => /truncated/.test(w)));

  // 5. Fenced reply: flagged, NOT stripped.
  const FENCED = '```json\n{"candidates":[]}\n```';
  next = ok(FENCED);
  await run(base(path.join(tmp, 'o5'), ['--no-ingest']));
  const d5 = onlyRun(path.join(tmp, 'o5'));
  check('fenced reply kept as returned', fs.readFileSync(path.join(d5, 'reply.json'), 'utf8') === FENCED);
  check('fence flagged', JSON.parse(fs.readFileSync(path.join(d5, 'run.json'), 'utf8')).warnings.some((w) => /fence/.test(w)));

  // 6. API error: body saved, exit 2, ingest never called.
  fs.rmSync(STUB_OUT, { force: true });
  next = () => ({ status: 529, payload: { type: 'error', error: { type: 'overloaded_error' } } });
  r = await run(base(path.join(tmp, 'o6')));
  const d6 = onlyRun(path.join(tmp, 'o6'));
  check('API error exits 2', r.code === 2);
  check('API error body saved', /overloaded_error/.test(fs.readFileSync(path.join(d6, 'api-response.json'), 'utf8')));
  check('API error does not ingest', !fs.existsSync(STUB_OUT));

  // 7. Bad label rejected.
  r = await run(base(path.join(tmp, 'o7')).map((x) => (x === 'development_retest' ? 'accuracy' : x)));
  check('unknown label exits 1', r.code === 1);

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? failures + ' FAILED, ' + pass + ' passed' : 'ALL PASS (' + pass + ')');
  process.exit(failures ? 1 : 0);
}

main();
