/*
 * Finds Discord's internal modules. Discord loads several webpack runtimes that share one
 * chunk array (webpackChunkdiscord_app); we keep every runtime's require and search them all.
 */
import { logger } from "./logger";
import { sleep } from "./utils";

export type Filter = (m: any) => boolean;
type WebpackRequire = ((id: string | number) => any) & { c: Record<string, { exports: any }>; m: Record<string, unknown> };

const NOT_A_PROP = "__obsidDefinitelyNotARealProp__";
const isSearchable = (v: any) => {
    try {
        return v != null && (typeof v === "object" || typeof v === "function") &&
            v !== window && v !== document && v[NOT_A_PROP] === undefined; // skips catch-all Proxies
    } catch { return false; }
};

export const filters = {
    byProps: (...props: string[]): Filter => m => props.every(p => m[p] !== undefined),
    byCode: (...code: string[]): Filter => m => {
        if (typeof m !== "function") return false;
        let s: string;
        try { s = Function.prototype.toString.call(m); } catch { return false; }
        return code.every(c => s.includes(c));
    },
    byStoreName: (name: string): Filter => m => typeof m?.getName === "function" && m.getName() === name,
};

export const requires: WebpackRequire[] = [];
let lastInit = 0;
let settled = false;

/** The runtime with the most modules (Discord's main one). */
export function mainRequire(): WebpackRequire | null {
    let best: WebpackRequire | null = null, size = -1;
    for (const r of requires) {
        const n = Object.keys(r.c).length;
        if (n > size) { best = r; size = n; }
    }
    return best;
}

function init() {
    if (settled) return true;
    const chunk = (window as any).webpackChunkdiscord_app;
    if (!chunk?.push) return false;
    if (Date.now() - lastInit < 2000) return requires.length > 0;
    lastInit = Date.now();
    try {
        // Every runtime in the push chain calls our callback with its own require.
        chunk.push([[Symbol("obsid")], {}, (r: WebpackRequire) => { if (r?.c && !requires.includes(r)) requires.push(r); }]);
        chunk.pop();
    } catch (e) { logger.error("webpack init failed", e); }
    const main = mainRequire();
    if (main && Object.keys(main.c).length > 2000) settled = true;
    return requires.length > 0;
}

/** Every candidate export: module.exports and each of its own properties. */
function* candidates(): Generator<any> {
    if (!init()) return;
    for (const r of requires) {
        for (const id in r.c) {
            const exp = r.c[id]?.exports;
            if (!isSearchable(exp)) continue;
            yield exp;
            if (typeof exp !== "object") continue;
            for (const key in exp) {
                let v: any;
                try { v = exp[key]; } catch { continue; }
                if (isSearchable(v)) yield v;
            }
        }
    }
}

export function find<T = any>(filter: Filter): T | null {
    for (const m of candidates()) {
        try { if (filter(m)) return m; } catch { }
    }
    return null;
}

export function findAll<T = any>(filter: Filter): T[] {
    const out = new Set<T>();
    for (const m of candidates()) { try { if (filter(m)) out.add(m); } catch { } }
    return [...out];
}

export const findByProps = <T = any>(...props: string[]) => find<T>(filters.byProps(...props));
export const findByCode = <T = any>(...code: string[]) => find<T>(filters.byCode(...code));
export const findStore = <T = any>(name: string) => find<T>(filters.byStoreName(name));

/** Polls until a module matching `filter` exists. Rejects after `timeout` ms. */
export async function waitFor<T = any>(filter: Filter, timeout = 60000): Promise<T> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const m = find<T>(filter);
        if (m) return m;
        await sleep(250);
    }
    throw new Error("webpack.waitFor timed out");
}

/** Resolves once Discord's core stores have loaded. */
export const ready: Promise<void> = waitFor(filters.byProps("getCurrentUser", "getUser"), 120000)
    .then(() => logger.log("Webpack ready"))
    .catch(e => logger.error("Webpack never became ready:", e));

export const webpack = {
    filters, find, findAll, findByProps, findByCode, findStore, waitFor, ready,
    get requires() { return requires; },
    get require() { return mainRequire(); },
};
