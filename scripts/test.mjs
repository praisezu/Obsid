// Runs the tests in tests/*.test.ts with Node's built-in test runner.
// Each test file is bundled with esbuild; Vanta's Discord-facing modules are swapped for the stand-ins in tests/stubs.
import { build } from "esbuild";
import { readdirSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".test-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const stubs = {
    name: "vanta-test-stubs",
    setup(b) {
        b.onResolve({ filter: /^@api$/ }, () => ({ path: join(root, "tests/stubs/api.ts") }));
        b.onResolve({ filter: /(^|\/)core\/(native|settings|webpack|common)$/ }, () => ({ path: join(root, "tests/stubs/core.ts") }));
        b.onResolve({ filter: /^\.\/(native|settings|webpack|common)$/ }, args =>
            /[\\/]core$/.test(args.resolveDir) ? { path: join(root, "tests/stubs/core.ts") } : undefined);
        b.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", external: true }));
    },
};

const files = readdirSync(join(root, "tests")).filter(f => f.endsWith(".test.ts"));
for (const f of files) {
    await build({
        entryPoints: [join(root, "tests", f)], outfile: join(out, f.replace(/\.ts$/, ".mjs")),
        bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "error", plugins: [stubs],
        define: { __VANTA_VERSION__: '"0.0.0"', __VANTA_REPO__: '"praisezu/Vanta"', __VANTA_DISCORD__: '""', __VANTA_WEBSITE__: '""' },
    });
}
const r = spawnSync(process.execPath, ["--test", ...files.map(f => join(out, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
