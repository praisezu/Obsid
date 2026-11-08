// Packs a release archive: release/vanta.tar.gz with dist/*.js, themes/, package.json, LICENSE.
// This is what the installer and the in-app updater download from GitHub Releases.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const want = ["dist/main.js", "dist/preload.js", "dist/renderer.js", "package.json", "LICENSE"];
const themesDir = join(root, "themes");
if (existsSync(themesDir)) for (const f of readdirSync(themesDir)) if (f.endsWith(".css")) want.push("themes/" + f);

for (const f of want) if (!existsSync(join(root, f))) throw new Error(`Missing ${f}. Run \`npm run build:release\` first.`);

/** Minimal ustar writer (regular files, names < 100 chars). */
function tar(files) {
    const blocks = [];
    for (const name of files) {
        const data = readFileSync(join(root, name));
        const h = Buffer.alloc(512);
        const put = (str, off, len) => h.write(str, off, len, "utf8");
        const oct = (n, len) => n.toString(8).padStart(len - 1, "0") + "\0";
        put(name, 0, 100);
        put(oct(0o644, 8), 100, 8);
        put(oct(0, 8), 108, 8);
        put(oct(0, 8), 116, 8);
        put(oct(data.length, 12), 124, 12);
        put(oct(Math.floor(statSync(join(root, name)).mtimeMs / 1000), 12), 136, 12);
        put("        ", 148, 8); // checksum placeholder
        put("0", 156, 1);
        put("ustar\0", 257, 6);
        put("00", 263, 2);
        let sum = 0;
        for (const b of h) sum += b;
        put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
        blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
    blocks.push(Buffer.alloc(1024));
    return Buffer.concat(blocks);
}

const out = join(root, "release");
mkdirSync(out, { recursive: true });
const archive = gzipSync(tar(want), { level: 9 });
writeFileSync(join(out, "vanta.tar.gz"), archive);
console.log(`release/vanta.tar.gz (${(archive.length / 1024).toFixed(1)} KB):\n  ${want.join("\n  ")}`);
void relative;
