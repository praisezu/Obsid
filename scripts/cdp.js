#!/usr/bin/env node
/*
 * Dev helper: talks to a Discord started with --remote-debugging-port=9223.
 *   node scripts/cdp.js eval "<js expression>"     evaluates in Discord's page (await supported)
 *   node scripts/cdp.js shot out.png               screenshots the Discord window
 *   node scripts/cdp.js reload                     reloads Discord (re-runs Vanta renderer code)
 * Set VANTA_CDP_PORT to use another port.
 */
"use strict";
const fs = require("fs");

const PORT = process.env.VANTA_CDP_PORT || 9223;
const [cmd, arg] = process.argv.slice(2);

const timer = setTimeout(() => { console.error("Timed out after 20s (is the page frozen?)"); process.exit(2); }, 20000);

async function main() {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    // Prefer the main window over pop-outs (discord.com/popout)
    const pages = targets.filter(t => t.type === "page" && /discord\.com/.test(t.url));
    const page = pages.find(t => !/\/popout/.test(t.url)) ?? pages[0];
    if (!page) throw new Error("Discord page not found. Is Discord running with --remote-debugging-port?");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params = {}) => new Promise(res => {
        const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });

    if (cmd === "evalfile") return runEval(send, fs.readFileSync(arg, "utf8"), ws);
    if (cmd === "eval") {
        const r = await send("Runtime.evaluate", {
            expression: `(async () => { return (${arg}); })()`,
            awaitPromise: true, returnByValue: true, userGesture: true,
        });
        if (r.result?.exceptionDetails) {
            console.error("Exception:", r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
            process.exitCode = 1;
        } else {
            const v = r.result?.result?.value;
            console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
        }
    } else if (cmd === "shot") {
        const r = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(arg || "discord.png", Buffer.from(r.result.data, "base64"));
        console.log("saved", arg || "discord.png");
    } else if (cmd === "reload") {
        await send("Page.reload", {});
        console.log("reloaded");
    } else {
        console.log("usage: cdp.js eval <expr> | shot <file> | reload");
    }
    ws.close();
    clearTimeout(timer);
}

async function runEval(send, code, ws) {
    const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result?.exceptionDetails) {
        console.error("Exception:", r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
        process.exitCode = 1;
    } else {
        const v = r.result?.result?.value;
        console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
    }
    ws.close();
    clearTimeout(timer);
}

main().catch(e => { console.error(e.message); process.exit(1); });
