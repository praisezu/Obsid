/*
 * Safety features that are always on:
 *
 * Token-grabber guard: your Discord login token lets anyone take over your account, and stealing it is what malicious
 * plugins do. Imported and store plugins run from files tagged vanta://user-plugins/…, so when one of them asks Discord
 * for the token, Vanta can tell from the call stack, refuses, and tells you which plugin it was. Separately, any web
 * request leaving for a site that isn't Discord with your token in its address or body is stopped, whoever sent it.
 *
 * Link checker: before a link in chat opens, its site is checked against a public list of known Discord scam and
 * phishing sites (Discord-AntiScam/scam-links, refreshed daily, checked on this PC). Known scams get a warning first.
 */
import { findAll, ready as webpackReady } from "./core/webpack";
import { patcher } from "./core/patcher";
import { net } from "./core/net";
import { native } from "./core/native";
import { storage } from "./core/storage";
import { logger } from "./core/logger";
import { ui, h } from "./ui/components";

const PLUGIN_FRAME = /vanta:\/\/user-plugins\/([^:)\s/]+)/;
const DISCORD_HOST = /(^|\.)(discord\.com|discordapp\.com|discordapp\.net|discord\.gg|discord\.media)$/i;

function userPluginInStack(): string | null {
    const m = PLUGIN_FRAME.exec(new Error().stack ?? "");
    return m ? decodeURIComponent(m[1]) : null;
}

const warned = new Set<string>();
function warnPlugin(file: string, what: string) {
    logger.warn(`Token guard: blocked ${file} (${what})`);
    if (warned.has(file + what)) return;
    warned.add(file + what);
    ui.modal({
        title: "Vanta blocked a plugin from your account",
        body: h("div", { style: { display: "grid", gap: "10px", lineHeight: "1.5" } },
            h("div", {}, h("b", {}, file), ` tried to ${what}. Your login token lets anyone take over your account, so Vanta stopped it.`),
            ui.note("danger", "If you didn't expect this plugin to need your account, delete it in Settings → Vanta Settings → Plugins.")),
        buttons: [{ text: "OK", variant: "primary" }],
    });
}

function startTokenGuard() {
    let token: string | null = null; // kept here only to recognise it in outgoing requests
    webpackReady.then(() => {
        const mods = findAll(m => typeof m?.getToken === "function" && (typeof m?.setToken === "function" || typeof m?.hideToken === "function" || typeof m?.getId === "function"));
        for (const mod of mods) {
            try {
                token ??= mod.getToken();
                patcher.instead(mod, "getToken", (args, original) => {
                    const file = userPluginInStack();
                    if (file) { warnPlugin(file, "read your Discord login token"); return undefined; }
                    return original(...args);
                });
            } catch (e) { logger.warn("Token guard couldn't hook one module:", e); }
        }
        if (!mods.length) logger.warn("Token guard: Discord's token module wasn't found");
    });
    // Nothing leaves for another website carrying your token
    net.block(req => {
        if (!token || token.length < 20) return false;
        let host = "";
        try { host = new URL(req.url, location.href).hostname; } catch { return false; }
        if (DISCORD_HOST.test(host)) return false;
        const body = typeof req.body === "string" ? req.body : "";
        if (!req.url.includes(token) && !body.includes(token)) return false;
        warnPlugin(userPluginInStack() ?? "Something", `send your login token to ${host}`);
        return true;
    });
}

// ---------- link checker ----------
const LIST_URL = "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.txt";
let scams: Set<string> | null = null;

async function loadList() {
    const cached = await storage.get<{ at: number; domains: string[] }>("ScamLinks");
    if (cached?.domains?.length) scams = new Set(cached.domains);
    if (cached && Date.now() - cached.at < 86_400_000) return;
    try {
        const text = await native.fetchText(LIST_URL);
        const domains = text.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith("#") && l.includes("."));
        if (domains.length > 1000) { scams = new Set(domains); storage.set("ScamLinks", { at: Date.now(), domains }, 0); }
    } catch (e) { logger.warn("Couldn't update the scam link list:", e); }
}

/** The site itself or any parent domain is on the list */
export function isScam(url: string): string | null {
    if (!scams) return null;
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
    const parts = host.split(".");
    for (let i = 0; i < parts.length - 1; i++) { const d = parts.slice(i).join("."); if (scams.has(d)) return host; }
    return null;
}

function startLinkChecker() {
    loadList();
    document.addEventListener("click", e => {
        const a = (e.target as Element | null)?.closest?.("a[href^='http']") as HTMLAnchorElement | null;
        if (!a || a.dataset.vantaChecked) return;
        const bad = isScam(a.href);
        if (!bad) return;
        e.preventDefault(); e.stopImmediatePropagation();
        ui.modal({
            title: "This link is a known scam",
            body: h("div", { style: { display: "grid", gap: "10px", lineHeight: "1.5" } },
                h("div", {}, h("b", {}, bad), " is on a public list of Discord scam and phishing sites (fake Nitro, fake logins, fake giveaways)."),
                ui.note("danger", "Never log in or connect a wallet on a site you reached from a link like this.")),
            buttons: [
                { text: "Open anyway", variant: "ghost", onClick: () => { a.dataset.vantaChecked = "1"; native.openUrl(a.href); } },
                { text: "Don't open", variant: "primary" },
            ],
        });
    }, true);
}

export function startSecurity() {
    try { startTokenGuard(); } catch (e) { logger.error("Token guard failed to start", e); }
    try { startLinkChecker(); } catch (e) { logger.error("Link checker failed to start", e); }
}
// for plugins that want to check links too
export const security = { isScam };

