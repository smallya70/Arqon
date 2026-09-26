/* Microsoft Graph: token acquisition and draft creation.
   Zero dependencies — global fetch, Node 22+.

   Delegated only. The analyst signs in; drafts land in THEIR Outlook, under
   their identity, in their sent items once they press send. Application
   permissions would grant send-as-anyone across the tenant and are not used. */

const TOKEN_TTL_MARGIN_MS = 60_000;
const tokenCache = new Map(); // tenantId -> {token, expiresAt}

async function post(url, body, headers = {}) {
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error_description || text.slice(0, 300);
    const err = new Error(`Graph ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/* Refresh-token grant. The refresh token comes from the interactive sign-in
   your web app already performs; this server never handles a password. */
export async function accessToken(cfg, tenantId) {
  const hit = tokenCache.get(tenantId);
  if (hit && hit.expiresAt - TOKEN_TTL_MARGIN_MS > Date.now()) return hit.token;

  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: cfg.refreshTokens[tenantId],
    scope: "https://graph.microsoft.com/Mail.ReadWrite offline_access",
  });
  if (!cfg.refreshTokens[tenantId])
    throw new Error(`No refresh token stored for tenant ${tenantId}. The analyst must sign in first.`);

  const json = await post(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    form,
    { "Content-Type": "application/x-www-form-urlencoded" }
  );
  tokenCache.set(tenantId, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}

/* Creates the message in the signed-in user's Drafts. It is NOT sent.
   Mail.ReadWrite is deliberately narrower than Mail.Send: with this scope the
   server cannot send at all, only draft. */
export async function createDraft(cfg, tenantId, { to, subject, html }) {
  const token = await accessToken(cfg, tenantId);
  const msg = await post(
    "https://graph.microsoft.com/v1.0/me/messages",
    JSON.stringify({
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    }),
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  );
  return { id: msg.id, webLink: msg.webLink };
}
