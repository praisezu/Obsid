// Builds Vanta into dist/:  main.js (Electron main), preload.js, renderer.js (runs in Discord's page).
//   node scripts/build.mjs            one-off build
//   node scripts/build.mjs --watch    rebuild on change (then Ctrl+R in Discord for renderer changes)
import * as esbuild from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const watch = process.argv.includes("--watch");
const release = process.argv.includes("--release"); // minified, no source maps

const define = {
    __VANTA_VERSION__: JSON.stringify(pkg.version),
    __VANTA_REPO__: JSON.stringify(pkg.vanta?.repo ?? "praisezu/Obsid"),
};
const alias = { "@api": join(root, "src/renderer/api.ts"), "@shared": join(root, "src/shared") };

/** `import plugins from "~plugins"` → every file in src/plugins, sorted. */
const pluginsModule = {
    name: "vanta-plugins",
    setup(build) {
        build.onResolve({ filter: /^~plugins$/ }, () => ({ path: "plugins", namespace: "vanta-plugins" }));
        build.onLoad({ filter: /.*/, namespace: "vanta-plugins" }, () => {
            const dir = join(root, "src/plugins");
            const files = readdirSync(dir).filter(f => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts")).sort();
            const contents = files.map((f, i) => `import p${i} from ${JSON.stringify(join(dir, f))};`).join("\n")
                + `\nexport default [${files.map((_, i) => `p${i}`).join(", ")}];`;
            return { contents, resolveDir: dir, loader: "ts", watchFiles: files.map(f => join(dir, f)), watchDirs: [dir] };
        });
    },
};

const common = {
    bundle: true, legalComments: "none", logLevel: "info", define, alias, target: "es2022",
    sourcemap: release ? false : "inline", minify: release,
};

const configs = [
    { ...common, entryPoints: [join(root, "src/main/index.ts")], outfile: join(root, "dist/main.js"), platform: "node", format: "cjs", external: ["electron"] },
    { ...common, entryPoints: [join(root, "src/preload/index.ts")], outfile: join(root, "dist/preload.js"), platform: "node", format: "cjs", external: ["electron"] },
    { ...common, entryPoints: [join(root, "src/renderer/index.ts")], outfile: join(root, "dist/renderer.js"), platform: "browser", format: "iife", plugins: [pluginsModule] },
];

if (watch) {
    for (const c of configs) await (await esbuild.context(c)).watch();
    console.log("Watching for changes…");
} else {
    await Promise.all(configs.map(c => esbuild.build(c)));
}
