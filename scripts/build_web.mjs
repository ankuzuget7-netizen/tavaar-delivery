import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = resolve(process.argv[2] ?? "web-dist");
const result = spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", outputDir], {
  cwd: resolve(import.meta.dirname, ".."),
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status ?? 1);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk(outputDir)) {
  if (!file.endsWith(".html")) continue;
  const rel = relative(outputDir, file);
  if (rel === "index.html" || rel.split(/[\\/]/)[0].startsWith("_")) continue;
  const routeDir = join(outputDir, rel.slice(0, -5));
  mkdirSync(routeDir, { recursive: true });
  cpSync(file, join(routeDir, "index.html"));
}

if (!existsSync(join(outputDir, "index.html"))) {
  throw new Error(`Web export did not produce ${outputDir}/index.html`);
}
console.log(`Web export ready with extensionless route aliases: ${outputDir}`);
