/*
 * BetterDiscord theme store. betterdiscord.app is a SvelteKit site; its themes page data is
 * served at /themes/__data.json in SvelteKit's "devalue" format (values reference each other by
 * index), which we decode here. Theme files download from /Download?id=<id>.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { BdTheme } from "@shared/types";
import { safeName } from "./util";

const SITE = "https://betterdiscord.app";
let cache: { at: number; themes: BdTheme[] } | null = null;

/** Decodes devalue's flattened array format into plain values. */
function unflatten(values: any[]): any {
    const seen = new Map<number, any>();
    const h = (i: number): any => {
        if (i === -1) return undefined;
        if (i === -3) return NaN;
        if (seen.has(i)) return seen.get(i);
        const v = values[i];
        if (v === null || typeof v !== "object") return v;
        if (Array.isArray(v)) {
            if (typeof v[0] === "string") return v[0] === "Date" ? v[1] : v[0] === "Set" ? v.slice(1).map(h) : null;
            const arr: any[] = [];
            seen.set(i, arr);
            for (const x of v) arr.push(h(x));
            return arr;
        }
        const obj: Record<string, any> = {};
        seen.set(i, obj);
        for (const [k, x] of Object.entries(v)) obj[k] = h(x as number);
        return obj;
    };
    return h(0);
}

export async function bdThemes(force = false): Promise<BdTheme[]> {
    if (!force && cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.themes;
    const res = await fetch(`${SITE}/themes/__data.json`, { headers: { "User-Agent": "Vanta" } });
    if (!res.ok) throw new Error(`BetterDiscord returned HTTP ${res.status}`);
    const raw = await res.json() as any;
    const node = (raw.nodes || []).find((n: any) => n?.type === "data" && Array.isArray(n.data) && JSON.stringify(n.data).includes('"addons"'));
    if (!node) throw new Error("BetterDiscord's theme list has an unexpected format");
    const page = unflatten(node.data);
    const themes: BdTheme[] = (page.addons || []).filter((a: any) => a?.type?.label === "theme" || a?.typeId === 1).map((a: any) => ({
        id: Number(a.id),
        name: String(a.name),
        description: String(a.description || ""),
        author: String(a.author?.login?.displayName || a.author?.githubName || "Unknown"),
        downloads: Number(a.downloads) || 0,
        likes: Number(a.likes) || 0,
        tags: (a.tags || []).map(String),
        thumbnail: a.thumbnailId ? `${SITE}/image/${a.thumbnailId}` : null,
        released: String(a.releaseDate || a.creationDate || ""),
        page: `${SITE}/theme/${encodeURIComponent(String(a.name))}`,
    }));
    cache = { at: Date.now(), themes };
    return themes;
}

/** Downloads a theme into the themes folder. Returns the saved file name. */
export async function bdInstallTheme(id: number, themesDir: string): Promise<string> {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid theme id");
    const res = await fetch(`${SITE}/Download?id=${id}`, { headers: { "User-Agent": "Vanta" }, redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const css = await res.text();
    if (css.length > 5 * 1024 * 1024) throw new Error("Theme is larger than 5 MB");
    if (/^\s*</.test(css)) throw new Error("BetterDiscord sent a web page instead of a theme file");
    const disposition = res.headers.get("content-disposition") || "";
    let name = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] || `bd-${id}.theme.css`;
    name = decodeURIComponent(name).replace(/[^\w.\-]+/g, "_");
    if (!name.toLowerCase().endsWith(".css")) name += ".css";
    const file = safeName(name, ".css");
    const tmp = path.join(themesDir, file + ".tmp");
    fs.writeFileSync(tmp, css);
    fs.renameSync(tmp, path.join(themesDir, file));
    return file;
}
