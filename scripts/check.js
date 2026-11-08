// Syntax-checks every Obsid source file. Usage: npm run check
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== "node_modules") walk(p);
        else if (e.name.endsWith(".js")) files.push(p);
    }
})(path.join(root, "src"));
files.push(...fs.readdirSync(__dirname).filter(f => f.endsWith(".js")).map(f => path.join(__dirname, f)));

let failed = 0;
for (const f of files) {
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); console.log("ok   ", path.relative(root, f)); }
    catch (e) { failed++; console.log("FAIL ", path.relative(root, f), "\n" + e.stderr); }
}
process.exit(failed ? 1 : 0);
