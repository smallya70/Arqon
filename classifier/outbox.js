/* Outbox and response history.

   The sending is manual today and will be backend-managed later. What must not
   be manual is the record of it: "was the policy lead ever asked about Q-002,
   and did they answer?" is a question the system has to answer from its own
   data, not from somebody's sent items.

   Three separate events, three separate authors, never collapsed:

     sent       a question was put to someone, covering named records
     reply      something came back — evidence, not an answer
     resolution someone with authority decided the question is closed

   A reply does not close anything. A system that resolves on reply accumulates
   decisions nobody made, which is the failure this design exists to prevent. */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./manifest.js";

/* Resolved at call time, not at import: a module that captures its
   configuration when it loads ignores anything set afterwards. */
const OUT = () => join(process.env.ARQON_STORE || ".arqon", "outbox");
const ensure = () => mkdirSync(OUT(), { recursive: true });

const path = (id) => join(OUT(), id + ".json");
const read = (id) => JSON.parse(readFileSync(path(id), "utf8"));
const write = (m) => writeFileSync(path(m.id), JSON.stringify(m, null, 2));

export function recordSent({ to, subject, body, recordIds, sentBy, channel = "manual",
                             programme = null, sentAt = new Date().toISOString() }) {
  ensure();
  if (!to) throw new Error("recordSent: to is required.");
  if (!Array.isArray(recordIds) || !recordIds.length)
    throw new Error("recordSent: recordIds is required — a message not tied to records " +
                    "cannot be found again when someone asks about one.");
  if (!sentBy) throw new Error("recordSent: sentBy is required.");
  const id = "MSG-" + sentAt.replace(/[-:.TZ]/g, "").slice(0, 14) + "-" +
             sha256(Buffer.from(to + subject + recordIds.join(","))).slice(0, 6);
  const msg = {
    schema: "arqon.message/1", id, programme, channel,
    to: Array.isArray(to) ? to : [to],
    subject: subject ?? null,
    body: body ?? null,
    recordIds, sentBy, sentAt,
    /* What the tool observed. With a manual send it observed nothing: a person
       says they sent it, and that claim is recorded as a claim. */
    attestation: channel === "manual"
      ? "reported by the sender; the tool did not send or observe this message"
      : "sent by the application",
    replies: [],
    resolutions: [],
  };
  write(msg);
  return msg;
}

export function recordReply(messageId, { from, receivedAt = new Date().toISOString(),
                                         text, matchedBy = "manual" }) {
  const m = read(messageId);
  if (!from) throw new Error("recordReply: from is required.");
  if (!text) throw new Error("recordReply: text is required — the reply itself is the evidence.");
  m.replies.push({
    id: `${messageId}-R${m.replies.length + 1}`,
    from, receivedAt, text, matchedBy,
    note: "Received text. It answers nothing until someone with authority says so.",
  });
  write(m);
  return m;
}

/* Resolution is per record, not per message: one message may cover several
   questions and a reply may settle one of them. */
export function recordResolution(messageId, { recordId, decision, by, authorityBasis,
                                              at = new Date().toISOString(), note = "" }) {
  const m = read(messageId);
  if (!m.recordIds.includes(recordId))
    throw new Error(`recordResolution: ${recordId} was not covered by ${messageId}.`);
  if (!by) throw new Error("recordResolution: by is required — who decided this.");
  if (!authorityBasis)
    throw new Error("recordResolution: authorityBasis is required. Authority is by subject; " +
                    "a reply from someone without it settles nothing.");
  if (!["answered", "not_answered", "superseded", "withdrawn"].includes(decision))
    throw new Error(`recordResolution: unknown decision "${decision}".`);
  m.resolutions.push({ recordId, decision, by, authorityBasis, at, note });
  write(m);
  return m;
}

export function list() {
  if (!existsSync(OUT())) return [];
  return readdirSync(OUT()).filter(f => f.endsWith(".json"))
    .map(f => read(f.replace(/\.json$/, "")))
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

/* The question the outbox exists to answer. */
export function historyFor(recordId) {
  const msgs = list().filter(m => m.recordIds.includes(recordId));
  return {
    recordId,
    asked: msgs.map(m => ({ message: m.id, to: m.to, sentAt: m.sentAt, sentBy: m.sentBy,
                            channel: m.channel, attestation: m.attestation })),
    replies: msgs.flatMap(m => m.replies.map(r => ({ message: m.id, ...r }))),
    resolutions: msgs.flatMap(m => m.resolutions.filter(x => x.recordId === recordId)
                                    .map(x => ({ message: m.id, ...x }))),
    get state() {
      if (this.resolutions.length) return this.resolutions[this.resolutions.length - 1].decision;
      if (this.replies.length) return "replied, unresolved";
      if (this.asked.length) return "asked, no reply recorded";
      return "never asked";
    },
  };
}
