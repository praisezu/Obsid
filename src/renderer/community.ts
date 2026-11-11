/*
 * How many people use Vanta, without tracking anyone: it's worked out from GitHub's public download counts.
 *
 * - Installs: every download of a Vanta installer (Windows, macOS, Linux), across all releases.
 * - Active: installs that downloaded the newest update. Running Vantas update themselves within ~30 minutes of a
 *   release, so this follows the number of Vantas that are actually in use. Right after a release (when few have
 *   updated yet), the release before it is counted too.
 */
import { native } from "./core/native";
import { storage } from "./core/storage";

export interface CommunityStats { installs: number; active: number; version: string; at: number }
const INSTALLERS = /^VantaInstaller(\.exe|-linux|-macos|-macos-intel)$/;
const UPDATES = /^(vanta|obsid)\.tar\.gz$/;
const HOUR = 60 * 60_000;

let pending: Promise<CommunityStats | null> | null = null;

export function communityStats(force = false): Promise<CommunityStats | null> {
    return pending ??= (async () => {
        const cached = await storage.get<CommunityStats>("Community");
        if (cached && !force && Date.now() - cached.at < HOUR) return cached;
        try {
            const raw = JSON.parse(await native.fetchText(`https://api.github.com/repos/${__VANTA_REPO__}/releases?per_page=100`));
            const releases = (Array.isArray(raw) ? raw : []).filter((r: any) => !r.draft && !r.prerelease);
            const count = (r: any, re: RegExp) => (r?.assets ?? []).filter((a: any) => re.test(a.name)).reduce((t: number, a: any) => t + (a.download_count || 0), 0);
            const installs = releases.reduce((t: number, r: any) => t + count(r, INSTALLERS), 0);
            const [latest, previous] = releases;
            const fresh = latest && Date.now() - Date.parse(latest.published_at) < 24 * HOUR;
            const active = Math.max(count(latest, UPDATES), fresh ? count(previous, UPDATES) : 0);
            const stats = { installs, active, version: String(latest?.tag_name ?? ""), at: Date.now() };
            storage.set("Community", stats, 0);
            return stats;
        } catch { return cached ?? null; }
    })().finally(() => { pending = null; });
}
