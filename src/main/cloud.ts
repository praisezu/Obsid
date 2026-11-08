/*
 * Cloud sync through a private GitHub Gist on the user's own account.
 * The token is encrypted with Electron's safeStorage (DPAPI on Windows, Keychain on macOS) and never
 * stored in plain text; if encryption isn't available, signing in is refused.
 */
import { safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

const API = "https://api.github.com";
const FILE = "vanta-sync.json";
const DESCRIPTION = "Vanta settings sync (created by Vanta)";

export interface CloudState { signedIn: boolean; user: string | null; gistId: string | null; lastSync: string | null; remoteUpdated?: string | null }

export function createCloud(dataDir: string) {
    const tokenFile = path.join(dataDir, "cloud-token.bin");
    const stateFile = path.join(dataDir, "cloud.json");
    const readState = (): Omit<CloudState, "signedIn"> => {
        try { return { user: null, gistId: null, lastSync: null, ...JSON.parse(fs.readFileSync(stateFile, "utf8")) }; }
        catch { return { user: null, gistId: null, lastSync: null }; }
    };
    const writeState = (s: Omit<CloudState, "signedIn">) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 2));
    const token = () => {
        try { return safeStorage.decryptString(fs.readFileSync(tokenFile)); } catch { return null; }
    };

    async function gh(method: string, url: string, body?: unknown, t = token()) {
        if (!t) throw new Error("Not signed in to Cloud sync");
        const res = await fetch(API + url, {
            method,
            headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json", "User-Agent": "Vanta", ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) throw new Error("GitHub rejected the token (expired or revoked). Sign in again.");
        if (res.status === 403 || res.status === 404) throw new Error("The token can't access gists. Create one with the \"gist\" permission.");
        if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
        return res.status === 204 ? null : res.json() as Promise<any>;
    }

    async function findOrCreateGist(content: string) {
        const s = readState();
        if (s.gistId) return s.gistId;
        // Reuse an existing Vanta gist (e.g. made on another computer)
        for (let page = 1; page <= 5; page++) {
            const gists = await gh("GET", `/gists?per_page=100&page=${page}`) as any[];
            const found = gists.find(g => g.description === DESCRIPTION && g.files?.[FILE]);
            if (found) { writeState({ ...s, gistId: found.id }); return found.id as string; }
            if (gists.length < 100) break;
        }
        const created = await gh("POST", "/gists", { description: DESCRIPTION, public: false, files: { [FILE]: { content } } });
        writeState({ ...s, gistId: created.id });
        return created.id as string;
    }

    return {
        async status(): Promise<CloudState> {
            const s = readState();
            return { signedIn: !!token(), ...s };
        },
        async signIn(rawToken: string) {
            const t = String(rawToken).trim();
            if (!/^(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(t)) throw new Error("That doesn't look like a GitHub token (they start with ghp_ or github_pat_).");
            if (!safeStorage.isEncryptionAvailable()) throw new Error("Your system can't encrypt the token, so Vanta won't store it.");
            const user = await gh("GET", "/user", undefined, t);
            await gh("GET", "/gists?per_page=1", undefined, t); // checks the gist permission
            fs.writeFileSync(tokenFile, safeStorage.encryptString(t));
            writeState({ ...readState(), user: user.login });
            return { user: user.login as string };
        },
        async signOut() {
            try { fs.unlinkSync(tokenFile); } catch { }
            writeState({ user: null, gistId: null, lastSync: null });
        },
        async push(data: unknown) {
            const content = JSON.stringify(data);
            if (content.length > 9 * 1024 * 1024) throw new Error("Too much to sync (over 9 MB)");
            const id = await findOrCreateGist(content);
            const g = await gh("PATCH", `/gists/${id}`, { files: { [FILE]: { content } } });
            writeState({ ...readState(), gistId: id, lastSync: g.updated_at });
            return { updated: g.updated_at as string };
        },
        async pull() {
            const s = readState();
            const id = s.gistId ?? await (async () => {
                const gists = await gh("GET", "/gists?per_page=100") as any[];
                return gists.find(g => g.description === DESCRIPTION && g.files?.[FILE])?.id ?? null;
            })();
            if (!id) return null;
            const g = await gh("GET", `/gists/${id}`);
            const f = g.files?.[FILE];
            if (!f) return null;
            const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
            writeState({ ...readState(), gistId: id, lastSync: g.updated_at });
            return { data: JSON.parse(content), updated: g.updated_at as string };
        },
        /** When the cloud copy last changed (to suggest downloading). */
        async remoteUpdated() {
            const s = readState();
            if (!s.gistId || !token()) return null;
            const g = await gh("GET", `/gists/${s.gistId}`);
            return g.updated_at as string;
        },
    };
}
