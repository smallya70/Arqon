/* Local persistence. Candidate sets are saved awaiting review and nothing else:
   the store has no way to mark a record approved, because approval is a
   different event with a different signatory and it does not belong here. */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./manifest.js";

const ROOT = process.env.ARQON_STORE || ".arqon";
const SETS = join(ROOT, "candidate-sets");

const ensure = () => { mkdirSync(SETS, { recursive: true }); };

export function save(output, { validation, source, provider }) {
  ensure();
  const id = `${source.workshop || "session"}-${source.fingerprint}-${Date.now()}`;
  const record = {
    schema: "arqon.candidate-set/1",
    id,
    savedAt: new Date().toISOString(),
    state: "awaiting_review",          // the only state this store writes
    source,
    provider,
    validation: {
      valid: validation.valid,
      accepted: validation.accepted.length,
      rejected: validation.rejected.length,
      summary: validation.summary,
      errors: validation.errors,
    },
    /* Rejected candidates are kept, not dropped: a reviewer needs to see what
       was refused and why. They are not in the accepted set. */
    accepted: validation.accepted,
    rejected: validation.rejected,
  };
  record.contentHash = sha256(Buffer.from(JSON.stringify(record)));
  writeFileSync(join(SETS, id + ".json"), JSON.stringify(record, null, 2));
  return { id, path: join(SETS, id + ".json") };
}

export function list() {
  if (!existsSync(SETS)) return [];
  return readdirSync(SETS).filter(f => f.endsWith(".json")).map(f => {
    const r = JSON.parse(readFileSync(join(SETS, f), "utf8"));
    return { id: r.id, savedAt: r.savedAt, state: r.state,
             accepted: r.validation.accepted, rejected: r.validation.rejected,
             workshop: r.source.workshop, fingerprint: r.source.fingerprint };
  }).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export const load = (id) => JSON.parse(readFileSync(join(SETS, id + ".json"), "utf8"));
