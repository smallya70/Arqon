/* Evaluation manifest: freeze the source bytes with a real hash.

   The importer's fingerprint is a fast non-cryptographic digest — good enough
   to detect that a file changed, not good enough to prove it did not. An
   evaluation set that will be compared against for months needs the stronger
   guarantee, so both are recorded and their roles kept distinct. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function freeze(paths, { note = "" } = {}) {
  return {
    schema: "arqon.manifest/1",
    frozenAt: new Date().toISOString(),
    note,
    files: paths.map(p => {
      const bytes = readFileSync(p);
      return { path: p, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  };
}

export function verify(manifest) {
  return manifest.files.map(f => {
    let actual = null, present = true;
    try { actual = sha256(readFileSync(f.path)); } catch { present = false; }
    return { path: f.path, present, matches: present && actual === f.sha256, actual };
  });
}
