/*
 * Updates Vanta. Two modes:
 *  - git:     the Vanta folder is a git checkout → fetch + fast-forward pull, then rebuild is needed
 *             (dist/ is not committed), so this mode is meant for development.
 *  - release: installed by the installer from a GitHub release → download the latest release's
 *             vanta.tar.gz and unpack it over the install folder.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

import type { UpdateCheck, UpdaterInfo } from "@shared/types";
import { compareVersions } from "./util";

const REPO = __VANTA_REPO__;
const ASSET = "vanta.tar.gz";

function git(root: string, ...args: string[]) {
    return new Promise<{ ok: boolean; out: string; err: string }>(resolve => {
        execFile("git", args, { cwd: root, windowsHide: true, timeout: 60000 }, (err, stdout, stderr) =>
            resolve({ ok: !err, out: String(stdout).trim(), err: String(stderr || err?.message || "").trim() }));
    });
}

const isGitCheckout = (root: string) => fs.existsSync(path.join(root, ".git"));

export async function updaterInfo(root: string, version: string): Promise<UpdaterInfo> {
    if (!isGitCheckout(root)) return { mode: "release", version, root, repo: REPO };

    const info: UpdaterInfo = { mode: "git", version, root, repo: REPO, gitInstalled: true };
    if (!(await git(root, "--version")).ok) { info.gitInstalled = false; return info; }
    info.branch = (await git(root, "rev-parse", "--abbrev-ref", "HEAD")).out || null;
    info.commit = (await git(root, "log", "-1", "--format=%h %s")).out || null;
    const up = await git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
    info.upstream = up.ok ? up.out : null;
    const remote = await git(root, "remote", "get-url", "origin");
    info.remote = remote.ok ? remote.out : null;
    info.dirty = !!(await git(root, "status", "--porcelain", "--untracked-files=no")).out;
    return info;
}

async function latestRelease() {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Vanta-Updater" },
    });
    if (res.status === 404) return null; // no releases yet
    if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
    const r = await res.json() as any;
    const asset = (r.assets || []).find((a: any) => a.name === ASSET);
    return { tag: String(r.tag_name), name: String(r.name || r.tag_name), notes: String(r.body || ""), url: String(r.html_url), download: asset?.browser_download_url as string | undefined };
}

export async function updaterCheck(root: string, version: string): Promise<UpdateCheck> {
    const info = await updaterInfo(root, version);
    if (info.mode === "release") {
        try {
            const r = await latestRelease();
            const newer = r && r.download && compareVersions(r.tag, version) > 0;
            return { ...info, updates: [], release: newer ? { tag: r.tag, name: r.name, notes: r.notes, url: r.url } : null };
        } catch (e: any) {
            return { ...info, updates: [], release: null, error: "Couldn't reach GitHub: " + e.message };
        }
    }
    if (!info.gitInstalled || !info.upstream) return { ...info, updates: [] };
    const f = await git(root, "fetch", "--quiet");
    if (!f.ok) return { ...info, updates: [], error: "git fetch failed: " + f.err };
    const l = await git(root, "log", "--format=%h\x1f%an\x1f%ar\x1f%s", "HEAD..@{u}");
    const updates = l.out ? l.out.split("\n").map(line => {
        const [hash, author, when, message] = line.split("\x1f");
        return { hash, author, when, message };
    }) : [];
    return { ...info, updates };
}

/** Runs `npm run build` in a dev checkout so pulled source changes take effect. */
function npmBuild(root: string) {
    return new Promise<{ ok: boolean; out: string }>(resolve => {
        execFile(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"],
            { cwd: root, windowsHide: true, timeout: 180000, shell: process.platform === "win32" },
            (err, stdout, stderr) => resolve({ ok: !err, out: String(err ? stderr || err.message : stdout).trim() }));
    });
}

/** The installed version, read fresh (it changes when an update is applied while Discord keeps running) */
export const readVersion = (root: string, fallback: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || fallback; }
    catch { return fallback; }
};

/** Fingerprint of the parts that need a full Discord restart to change (main process and preload) */
function coreHash(root: string) {
    const h = createHash("sha256");
    for (const f of ["dist/main.js", "dist/preload.js"]) { try { h.update(fs.readFileSync(path.join(root, f))); } catch { h.update("missing"); } }
    return h.digest("hex");
}

export async function updaterApply(root: string, version: string): Promise<{ ok: boolean; output: string; version?: string; restart?: boolean }> {
    const r = await applyUpdate(root, version);
    // Only the in-Discord part changed? Then a quick refresh is enough; otherwise Discord has to restart.
    return r.ok ? { ...r, restart: coreHash(root) !== before.get(root) } : r;
}

const before = new Map<string, string>();
async function applyUpdate(root: string, version: string): Promise<{ ok: boolean; output: string; version?: string }> {
    before.set(root, coreHash(root));
    if (isGitCheckout(root)) {
        const r = await git(root, "pull", "--ff-only");
        if (!r.ok) return { ok: false, output: r.err };
        const b = await npmBuild(root);
        if (!b.ok) return { ok: false, output: "Pulled the update, but `npm run build` failed:\n" + b.out };
        const commit = (await git(root, "log", "-1", "--format=%h")).out;
        return { ok: true, output: "Updated and rebuilt. Restart Discord to finish.", version: `${readVersion(root, version)} (${commit})` };
    }
    const r = await latestRelease();
    if (!r?.download || compareVersions(r.tag, version) <= 0) return { ok: false, output: "No newer release found." };
    const res = await fetch(r.download, { redirect: "follow" });
    if (!res.ok) return { ok: false, output: `Download failed (HTTP ${res.status})` };
    const files = extractTarGz(Buffer.from(await res.arrayBuffer()));
    if (!files.some(f => f.name === "dist/main.js")) return { ok: false, output: "The release archive is missing dist/main.js" };
    for (const f of files) {
        const dest = path.join(root, f.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.data);
    }
    return { ok: true, output: `Updated to ${r.tag}. Restart Discord to finish.`, version: r.tag.replace(/^v/i, "") };
}

/** Minimal ustar/GNU tar reader for regular files. Rejects absolute paths and "..". */
export function extractTarGz(gz: Buffer) {
    const tar = gunzipSync(gz);
    const out: { name: string; data: Buffer }[] = [];
    const str = (b: Buffer) => b.toString("utf8").replace(/\0.*$/s, "");
    let longName: string | null = null;
    for (let off = 0; off + 512 <= tar.length;) {
        const header = tar.subarray(off, off + 512);
        if (header.every(b => b === 0)) break;
        const size = parseInt(str(header.subarray(124, 136)).trim() || "0", 8);
        const type = String.fromCharCode(header[156] || 48);
        const prefix = str(header.subarray(345, 500));
        let name = longName ?? (prefix ? prefix + "/" : "") + str(header.subarray(0, 100));
        longName = null;
        const data = tar.subarray(off + 512, off + 512 + size);
        off += 512 + Math.ceil(size / 512) * 512;
        if (type === "L") { longName = str(data); continue; }
        if (type !== "0" && type !== "\0") continue; // only regular files
        name = name.replace(/^\.\//, "");
        if (!name || path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) throw new Error("Unsafe path in archive: " + name);
        out.push({ name, data: Buffer.from(data) });
    }
    return out;
}
