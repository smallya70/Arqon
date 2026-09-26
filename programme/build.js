/* Inline the shared modules into a standalone page. No bundler, no build tool:
   strip the module syntax and concatenate, so the page still opens from a file. */
import { readFileSync, writeFileSync } from "node:fs";
const strip = (f) => readFileSync(f, "utf8")
  .replace(/^import[\s\S]*?;\s*$/gm, "")
  .replace(/^export const /gm, "const ")
  .replace(/^export function /gm, "function ")
  .replace(/^export \{[^}]*\};?\s*$/gm, "")
  .replace(/^export /gm, "");
writeFileSync("arqon-programme.html",
  readFileSync("../cockpit/head.html", "utf8")
  + strip("dataset.js") + "\n" + strip("derive.js") + "\n" + strip("ui.js")
  + "\n</script>\n</body>\n</html>\n");
console.log("built arqon-programme.html");
