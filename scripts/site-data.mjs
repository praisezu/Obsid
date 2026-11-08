// Generates docs/plugins.json (the built-in plugin list for the website) and copies the logo.
//   node scripts/site-data.mjs
import { readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dir = join(root, "src/plugins");
const plugins = [];

for (const file of readdirSync(dir).filter(f => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf8");
    // Each plugin object starts with name: "…", followed by description and category somewhere after.
    const re = /name:\s*"([A-Za-z0-9]+)",\s*\n\s*description:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?category:\s*"(\w+)"/g;
    for (const m of src.matchAll(re)) plugins.push({ name: m[1], description: m[2].replace(/\\"/g, '"'), category: m[3] });
}
plugins.sort((a, b) => a.name.localeCompare(b.name));
const unique = [...new Map(plugins.map(p => [p.name, p])).values()];

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/plugins.json"), JSON.stringify({ version: pkg.version, repo: pkg.vanta?.repo, discord: pkg.vanta?.discord ?? "", plugins: unique }, null, 2) + "\n");
copyFileSync(join(root, "assets/logo.png"), join(root, "docs/logo.png"));
console.log(`docs/plugins.json: ${unique.length} plugins (v${pkg.version})`);
