/* Manual adapter: the prompt goes to a person, who runs it in whatever tool
   they already use and saves the JSON back.

   No key, no dependency, no network. It also keeps the adapter boundary honest
   from the start — an API adapter later implements the same two functions. */

import { writeFileSync, readFileSync } from "node:fs";

export const id = "manual";

export function prepare(prompt, path) {
  writeFileSync(path, prompt, "utf8");
  return { path, bytes: prompt.length };
}

/* The saved response may arrive wrapped in fences or with a preamble despite
   instructions; recover the JSON rather than failing on presentation. */
export function ingest(path) {
  const text = readFileSync(path, "utf8");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error(`No JSON object found in ${path}.`);
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Response in ${path} is not valid JSON: ${e.message}`);
  }
}

/* What the adapter can attest to. A person pasted this; which model produced
   it is their claim, not something the adapter observed. */
export const provenance = ({ model = "unknown (manual)" } = {}) =>
  ({ provider: id, model, attestation: "supplied by a person; not observed by the tool" });
