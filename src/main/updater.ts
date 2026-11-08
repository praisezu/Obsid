/*
 * Updates Obsid. Two modes:
 *  - git:     the Obsid folder is a git checkout → fetch + fast-forward pull, then rebuild is needed
 *             (dist/ is not committed), so this mode is meant for development.
 *  - release: installed by the installer from a GitHub release → download the latest release's
 *             obsid.tar.gz and unpack it over the install folder.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";

import type { UpdateCheck, UpdaterInfo } from "@shared/types";
import { compareVersions } from "./util";

const REPO = __OBSID_REPO__;
const ASSET = "obsid.tar.gz";

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
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Obsid-Updater" },
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

export async function updaterApply(root: string, version: string): Promise<{ ok: boolean; output: string }> {
    if (isGitCheckout(root)) {
        const r = await git(root, "pull", "--ff-only");
        if (!r.ok) return { ok: false, output: r.err };
        return { ok: true, output: r.out + "\nRun `npm run build`, then restart Discord." };
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
    return { ok: true, output: `Updated to ${r.tag}. Restart Discord to finish.` };
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
