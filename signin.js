#!/usr/bin/env node
/* Device code sign-in. Produces the delegated refresh token the server needs,
   and writes it into config.json against the tenant it belongs to.

   Zero dependencies, Node 22+. Run it once per tenant:
     node signin.js
     node signin.js --config ./config.json --tenant common

   You sign in on any browser — this process never sees a password. */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const SCOPE = "https://graph.microsoft.com/Mail.ReadWrite offline_access";
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) =>
    v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]]] : a, [])
);
const CONFIG = args.config || process.env.ARQON_CONFIG || "./config.json";

function die(msg) { console.error("\n" + msg + "\n"); process.exit(1); }

if (!existsSync(CONFIG))
  die(`No config at ${CONFIG}.\nCopy config.example.json to config.json and fill in graph.clientId first.`);

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const clientId = cfg.graph?.clientId;
if (!clientId || clientId.startsWith("<"))
  die(`graph.clientId is not set in ${CONFIG}.\nCreate the app registration in Azure first — multi-tenant,\ndelegated Mail.ReadWrite and offline_access, public client flow enabled.`);

/* "organizations" keeps personal Microsoft accounts out. Use a specific tenant
   GUID when signing in for one client. */
const authority = args.tenant || cfg.graph.signinAuthority || "organizations";

async function form(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* fall through */ }
  return { ok: res.ok, status: res.status, json, text };
}

const base = `https://login.microsoftonline.com/${encodeURIComponent(authority)}/oauth2/v2.0`;

console.log(`\nApp        ${clientId}`);
console.log(`Authority  ${authority}`);
console.log(`Scope      Mail.ReadWrite offline_access  (read and draft — not send)\n`);

const dc = await form(`${base}/devicecode`, { client_id: clientId, scope: SCOPE });
if (!dc.ok) {
  const e = dc.json?.error_description || dc.text;
  if (/AADSTS7000218|public client/i.test(e))
    die(`Azure refused the device code request:\n${e}\n\nFix: in the app registration, Authentication →\n"Allow public client flows" must be Yes.`);
  die(`Device code request failed (${dc.status}):\n${e}`);
}

console.log("─".repeat(62));
console.log(dc.json.message || `Go to ${dc.json.verification_uri} and enter code ${dc.json.user_code}`);
console.log("─".repeat(62));
console.log("\nWaiting for you to finish signing in…");

const deadline = Date.now() + dc.json.expires_in * 1000;
let interval = (dc.json.interval || 5) * 1000;
let token = null;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval));
  const res = await form(`${base}/token`, {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    device_code: dc.json.device_code,
  });
  if (res.ok) { token = res.json; break; }
  const err = res.json?.error;
  if (err === "authorization_pending") continue;
  if (err === "slow_down") { interval += 5000; continue; }
  if (err === "authorization_declined") die("Sign-in was declined.");
  if (err === "expired_token") die("The code expired. Run this again.");
  die(`Sign-in failed: ${res.json?.error_description || res.text}`);
}
if (!token) die("Timed out waiting for sign-in.");
if (!token.refresh_token)
  die("No refresh token came back. offline_access is missing from the app registration's permissions.");

/* Which tenant did the user actually sign in to? Ask Graph rather than assume,
   because "organizations" resolves to whatever tenant they chose. */
let tenantId = authority;
let upn = "(unknown)";
try {
  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (me.ok) {
    const j = await me.json();
    upn = j.userPrincipalName || j.displayName || upn;
  }
  const claims = JSON.parse(Buffer.from(token.access_token.split(".")[1], "base64url").toString());
  if (claims.tid) tenantId = claims.tid;
} catch {
  console.warn("Could not read the tenant from the token; falling back to the authority value.");
}

cfg.graph.refreshTokens = cfg.graph.refreshTokens || {};
const replacing = !!cfg.graph.refreshTokens[tenantId];
cfg.graph.refreshTokens[tenantId] = token.refresh_token;

copyFileSync(CONFIG, CONFIG + ".bak");
writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");

console.log(`\nSigned in as ${upn}`);
console.log(`Tenant       ${tenantId}`);
console.log(`Config       ${CONFIG} ${replacing ? "(refresh token replaced)" : "(refresh token added)"}`);
console.log(`Backup       ${CONFIG}.bak\n`);
console.log("The refresh token is a credential. Keep config.json out of version control,");
console.log("and move it to a secret store before this runs anywhere but your machine.\n");
console.log("Next: add a row to programme_role with this tenant id, then draft a notification.");
