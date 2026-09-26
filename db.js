/* Outbox and register access. node:sqlite, prepared statements only.
   Requires Node 22+. */
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Minimal slice of the register this server needs. In the real system these
-- tables live in the register service; the server reads them, never writes.
CREATE TABLE IF NOT EXISTS record (
  id              TEXT PRIMARY KEY,
  programme_id    TEXT NOT NULL,
  workshop_id     TEXT NOT NULL,
  kind            TEXT NOT NULL,
  type            TEXT,
  statement       TEXT NOT NULL,
  owner_role      TEXT,
  owner_origin    TEXT,
  review_status   TEXT NOT NULL,
  business_status TEXT NOT NULL,
  blockers        TEXT,            -- JSON array, computed by the register engine
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_evidence (
  record_id  TEXT NOT NULL REFERENCES record(id),
  passage_id TEXT NOT NULL,
  speaker    TEXT,
  quote      TEXT,
  PRIMARY KEY (record_id, passage_id)
);

-- Who holds which role on a programme. THE ONLY source of recipient addresses.
-- Nothing is ever parsed out of record text.
CREATE TABLE IF NOT EXISTS programme_role (
  programme_id TEXT NOT NULL,
  role         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email        TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (programme_id, role)
);

-- Every draft created and every send, against the record it concerns.
CREATE TABLE IF NOT EXISTS outbox (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  programme_id   TEXT NOT NULL,
  record_ids     TEXT NOT NULL,   -- JSON array
  template       TEXT NOT NULL,
  audience_role  TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body_hash      TEXT NOT NULL,
  graph_draft_id TEXT,
  web_link       TEXT,
  state          TEXT NOT NULL,   -- draft_created | draft_failed
                                  -- No 'sent' state: Mail.ReadWrite can create a draft but
                                  -- cannot observe whether a person later sent it. Detecting
                                  -- that needs a Sent Items poll or a Graph subscription,
                                  -- which belongs in a separate service, not here.
  error          TEXT,
  requested_by   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  sent_at        TEXT
);

CREATE INDEX IF NOT EXISTS ix_outbox_programme ON outbox(programme_id, created_at);
CREATE INDEX IF NOT EXISTS ix_record_programme ON record(programme_id, business_status);
`;

export function open(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/* ---- reads ---- */

export function recordsByIds(db, programmeId, ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT * FROM record WHERE programme_id = ? AND id IN (${marks})`
  );
  return stmt.all(programmeId, ...ids);
}

export function recordsAwaiting(db, programmeId, role, limit) {
  const stmt = db.prepare(
    `SELECT * FROM record
      WHERE programme_id = ?
        AND owner_role = ?
        AND business_status IN ('Proposed','Requested','Open','Unvalidated')
      ORDER BY updated_at
      LIMIT ?`
  );
  return stmt.all(programmeId, role, limit);
}

export function evidenceFor(db, recordId) {
  return db
    .prepare(
      `SELECT passage_id, speaker, quote FROM record_evidence
        WHERE record_id = ? ORDER BY passage_id`
    )
    .all(recordId);
}

export function resolveRole(db, programmeId, role) {
  return db
    .prepare(
      `SELECT display_name, email, tenant_id FROM programme_role
        WHERE programme_id = ? AND role = ? AND active = 1`
    )
    .get(programmeId, role);
}

/* ---- outbox ---- */

export function logDraft(db, row) {
  const stmt = db.prepare(
    `INSERT INTO outbox
       (programme_id, record_ids, template, audience_role, recipient_email,
        subject, body_hash, graph_draft_id, web_link, state, error,
        requested_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const r = stmt.run(
    row.programmeId, JSON.stringify(row.recordIds), row.template,
    row.audienceRole, row.recipientEmail, row.subject, row.bodyHash,
    row.graphDraftId ?? null, row.webLink ?? null, row.state,
    row.error ?? null, row.requestedBy, new Date().toISOString()
  );
  return Number(r.lastInsertRowid);
}

export function outboxForRecord(db, programmeId, recordId) {
  return db
    .prepare(
      `SELECT id, template, audience_role, recipient_email, state, web_link,
              created_at, sent_at, error
         FROM outbox
        WHERE programme_id = ? AND record_ids LIKE ?
        ORDER BY created_at DESC`
    )
    .all(programmeId, `%"${recordId}"%`);
}

export function recentOutbox(db, programmeId, limit) {
  return db
    .prepare(
      `SELECT id, record_ids, template, audience_role, recipient_email, state,
              created_at, error
         FROM outbox WHERE programme_id = ?
        ORDER BY created_at DESC LIMIT ?`
    )
    .all(programmeId, limit);
}

/* Which records were already drafted to this role recently. Returned so the
   caller can warn, not silently skip — an analyst may legitimately re-send. */
export function notifiedWithin(db, programmeId, recordIds, role, sinceIso) {
  return recordIds.filter((id) => alreadyNotified(db, programmeId, id, role, sinceIso));
}

export function alreadyNotified(db, programmeId, recordId, role, sinceIso) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM outbox
        WHERE programme_id = ? AND audience_role = ?
          AND record_ids LIKE ? AND created_at > ?
          AND state = 'draft_created'`
    )
    .get(programmeId, role, `%"${recordId}"%`, sinceIso);
  return row.n > 0;
}
