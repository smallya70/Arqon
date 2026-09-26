#!/usr/bin/env node
/* ARQON notification MCP server.
   MCP over stdio, JSON-RPC 2.0. Zero dependencies, Node 22+.

   Design rule this server exists to enforce: the model chooses WHICH records
   and WHICH audience. It never chooses a recipient address, never writes the
   body, and cannot send. Recipients are resolved from programme_role; the body
   comes from a server-side template; the Graph scope is Mail.ReadWrite, which
   can draft but not send.

   Record text originates in client transcripts and is treated as data
   throughout. A transcript that contains an instruction addressed to an agent
   is rendered as escaped, quoted content and does nothing. */

import { createHash } from "node:crypto";
import * as DB from "./db.js";
import * as Graph from "./graph.js";
import { TEMPLATES, render } from "./templates.js";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(process.env.ARQON_CONFIG || "./config.json", "utf8"));
const db = DB.open(cfg.dbPath);
const MAX_RECORDS = 25;
const DEDUPE_WINDOW_DAYS = 7;

/* Templates that assert something about a record's state in their wording.
   The assertion is checked before the draft is built, because the email makes
   a governance claim to the person being asked to rely on it. */
const TEMPLATE_REQUIRES_REVIEW = new Set(["approval_request"]);

/* ---------- tool definitions ---------- */
const TOOLS = [
  {
    name: "list_pending",
    description:
      "List register records in a programme that are waiting on a given role — " +
      "approvals, unanswered questions, open actions. Read-only. Use this to see " +
      "what would be notified before drafting anything.",
    inputSchema: {
      type: "object",
      properties: {
        programme_id: { type: "string" },
        audience_role: { type: "string", description: "A role defined on the programme, e.g. 'Accounting policy lead'." },
        limit: { type: "integer", minimum: 1, maximum: MAX_RECORDS, default: 10 },
      },
      required: ["programme_id", "audience_role"],
    },
  },
  {
    name: "draft_notification",
    description:
      "Create an Outlook DRAFT to the role that owns the given records. The draft " +
      "lands in the analyst's own Drafts folder for them to read and send. This tool " +
      "cannot send mail. The recipient is resolved from the programme's role register " +
      "— an address cannot be supplied and is never taken from record content. The " +
      "body is a fixed server-side template. Records that are not owned by the given " +
      "audience_role are refused, as are approval requests for records that have not " +
      "passed analyst review.",
    inputSchema: {
      type: "object",
      properties: {
        programme_id: { type: "string" },
        record_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_RECORDS },
        audience_role: { type: "string", description: "Role to notify. Must exist on the programme, and must own every record listed." },
        template: { type: "string", enum: Object.keys(TEMPLATES) },
        resend: {
          type: "boolean", default: false,
          description: "Records already drafted to this role in the last " + DEDUPE_WINDOW_DAYS +
            " days are refused unless this is true. Set it only when the user has asked to send again.",
        },
      },
      required: ["programme_id", "record_ids", "audience_role", "template"],
    },
  },
  {
    name: "notification_history",
    description:
      "What has already been drafted or sent, for a record or across a programme. " +
      "Answers 'was this person ever told about this?' from the system rather than " +
      "from someone's sent items.",
    inputSchema: {
      type: "object",
      properties: {
        programme_id: { type: "string" },
        record_id: { type: "string", description: "Omit for the programme's recent history." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["programme_id"],
    },
  },
];

/* ---------- handlers ---------- */

function listPending({ programme_id, audience_role, limit = 10 }) {
  const role = DB.resolveRole(db, programme_id, audience_role);
  if (!role) return { error: `No active role '${audience_role}' on programme ${programme_id}.` };
  const rows = DB.recordsAwaiting(db, programme_id, audience_role, Math.min(limit, MAX_RECORDS));
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 864e5).toISOString();
  return {
    role: { name: role.display_name },     // address deliberately not returned
    records: rows.map((r) => ({
      id: r.id, kind: r.kind, type: r.type, statement: r.statement,
      business_status: r.business_status,
      blockers: JSON.parse(r.blockers || "[]"),
      already_notified: DB.alreadyNotified(db, programme_id, r.id, audience_role, since),
    })),
  };
}

async function draftNotification(
  { programme_id, record_ids, audience_role, template, resend = false }, requestedBy) {
  if (!TEMPLATES[template]) return { error: `Unknown template '${template}'.` };
  const role = DB.resolveRole(db, programme_id, audience_role);
  if (!role) return { error: `No active role '${audience_role}' on programme ${programme_id}.` };

  const ids = [...new Set(record_ids)].slice(0, MAX_RECORDS);
  const found = DB.recordsByIds(db, programme_id, ids);
  const missing = ids.filter((i) => !found.some((r) => r.id === i));
  if (!found.length)
    return { error: `None of those records exist in programme ${programme_id}.` };

  /* 1. The recipient is derived from the role, so the records must belong to it.
        Without this the model still picks who hears about what, just indirectly. */
  const wrongOwner = found.filter((r) => r.owner_role !== audience_role);
  if (wrongOwner.length)
    return {
      error: `Refused: ${wrongOwner.length} record(s) are not owned by '${audience_role}'.`,
      records: wrongOwner.map((r) => ({ id: r.id, owned_by: r.owner_role || "unassigned" })),
      remedy: "Draft separately to each owning role, or assign the owner in the register first.",
    };

  /* 2. The approval template states that records passed analyst review. Check it
        rather than assert it — the recipient is being asked to rely on that claim. */
  if (TEMPLATE_REQUIRES_REVIEW.has(template)) {
    const unreviewed = found.filter((r) => r.review_status !== "Approved");
    if (unreviewed.length)
      return {
        error: `Refused: the approval request states these records passed analyst review, ` +
               `but ${unreviewed.length} have not.`,
        records: unreviewed.map((r) => ({ id: r.id, review_status: r.review_status })),
        remedy: "Complete analyst review first, or use a template that makes no such claim.",
      };
  }

  /* 3. Dedupe warns and refuses by default; an analyst may still choose to resend. */
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 864e5).toISOString();
  const repeats = DB.notifiedWithin(db, programme_id, found.map((r) => r.id), audience_role, since);
  if (repeats.length && !resend)
    return {
      error: `Refused: ${repeats.length} record(s) were already drafted to '${audience_role}' ` +
             `within the last ${DEDUPE_WINDOW_DAYS} days.`,
      records: repeats,
      remedy: "Ask the user whether to send again. If they confirm, call this tool with resend: true.",
    };

  const records = found;

  const evidence = {};
  for (const r of records) evidence[r.id] = DB.evidenceFor(db, r.id);

  const ctx = {
    programmeName: cfg.programmes[programme_id]?.name || programme_id,
    workshopRef: records[0].workshop_id,
    recipientName: role.display_name,
    records, evidence,
    registerUrl: cfg.programmes[programme_id]?.registerUrl || cfg.registerUrl,
    requestedBy,
  };
  const { subject, html } = render(template, ctx);
  const bodyHash = createHash("sha256").update(html).digest("hex").slice(0, 16);

  /* state is only ever draft_created or draft_failed. The server has no way to
     observe a send — see the note in the README on why 'sent' does not exist. */
  let draft = null, state = "draft_created", error = null;
  try {
    draft = await Graph.createDraft(cfg.graph, role.tenant_id, {
      to: role.email, subject, html,
    });
  } catch (e) {
    state = "draft_failed";
    error = e.message;
  }

  const outboxId = DB.logDraft(db, {
    programmeId: programme_id, recordIds: records.map((r) => r.id), template,
    audienceRole: audience_role, recipientEmail: role.email, subject, bodyHash,
    graphDraftId: draft?.id, webLink: draft?.webLink, state, error, requestedBy,
  });

  if (state === "draft_failed")
    return { error: `Draft not created: ${error}`, outbox_id: outboxId, logged: true };

  return {
    outbox_id: outboxId,
    state,
    recipient: role.display_name,
    subject,
    records_included: records.map((r) => r.id),
    records_not_found: missing,
    redrafted: resend && repeats.length ? repeats : undefined,
    open_draft: draft.webLink,
    note: "Created as a draft in your Outlook. Nothing has been sent — read it and send from " +
          "Outlook. This server cannot observe whether you do; the outbox records the draft only.",
  };
}

function history({ programme_id, record_id, limit = 20 }) {
  const rows = record_id
    ? DB.outboxForRecord(db, programme_id, record_id)
    : DB.recentOutbox(db, programme_id, limit);
  return { entries: rows };
}

/* ---------- MCP plumbing ---------- */

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const content = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

async function handle(req) {
  const { id, method, params } = req;
  try {
    if (method === "initialize")
      return ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "arqon-notify", version: "0.1.0" },
      });
    if (method === "notifications/initialized") return;
    if (method === "tools/list") return ok(id, { tools: TOOLS });
    if (method === "tools/call") {
      const { name, arguments: args = {} } = params || {};
      const by = cfg.requestedBy || "ARQON analyst";
      if (name === "list_pending") return ok(id, content(listPending(args)));
      if (name === "draft_notification") return ok(id, content(await draftNotification(args, by)));
      if (name === "notification_history") return ok(id, content(history(args)));
      return fail(id, -32601, `Unknown tool: ${name}`);
    }
    return fail(id, -32601, `Unknown method: ${method}`);
  } catch (e) {
    // A failure here degrades to an error response; the server keeps running.
    return fail(id, -32000, e.message);
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    await handle(req);
  }
});
process.stdin.on("end", () => process.exit(0));
