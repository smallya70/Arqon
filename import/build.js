import { readFileSync, writeFileSync } from "node:fs";
const strip = f => readFileSync(f, "utf8")
  .replace(/^import[\s\S]*?;\s*$/gm, "")
  .replace(/^export const /gm, "const ")
  .replace(/^export function /gm, "function ")
  .replace(/^export /gm, "");
writeFileSync("arqon-import.html",
  readFileSync("page.html", "utf8") + strip("core.js") + "\n" + strip("app.js")
  + "\n</script>\n</body>\n</html>\n");
console.log("built arqon-import.html");
