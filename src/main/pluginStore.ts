/*
 * Vanta plugin store. The catalogue is store/plugins.json in the Vanta GitHub repo; plugin files
 * live next to it in store/official/ (made by Vanta) or store/community/ (submitted by users via
 * pull request). Every entry pins a sha256 of the reviewed file, and downloads are refused if the
 * file doesn't match — so code can't be swapped after review.
 */
import { createHash } from "node:crypto";
import type { FetchedPlugin, StorePlugin } from "@shared/types";

const REPO = __VANTA_REPO__;
const BRANCH = "main";
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const PATH_RE = /^store\/(official|community)\/[\w.\-]+\.js$/;

let cache: { at: number; plugins: StorePlugin[] } | null = null;

export async function storeIndex(force = false) {
    if (force || !cache || Date.now() - cache.at > 10 * 60 * 1000) {
        const res = await fetch(RAW + "store/plugins.json", { headers: { "User-Agent": "Vanta" }, cache: "no-store" });
        if (!res.ok) throw new Error(`Couldn't load the plugin store (HTTP ${res.status})`);
        const data = await res.json() as { plugins?: StorePlugin[] };
        const plugins = (data.plugins || []).filter(p =>
            p && typeof p.name === "string" && PATH_RE.test(String(p.path)) && /^[a-f0-9]{64}$/.test(String(p.sha256)));
        cache = { at: Date.now(), plugins };
    }
    return { plugins: cache.plugins, repo: REPO, branch: BRANCH };
}

export async function storeDownload(path: string, sha256: string): Promise<FetchedPlugin> {
    if (!PATH_RE.test(String(path))) throw new Error("That isn't a Vanta store plugin path");
    if (!/^[a-f0-9]{64}$/.test(String(sha256))) throw new Error("Missing checksum");
    const url = RAW + path;
    const res = await fetch(url, { headers: { "User-Agent": "Vanta" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const code = await res.text();
    const actual = createHash("sha256").update(code, "utf8").digest("hex");
    if (actual !== sha256)
        throw new Error("This plugin's file doesn't match the version that was reviewed for the store, so it wasn't installed.");
    return { fileName: path.split("/").pop()!, code, url };
}
