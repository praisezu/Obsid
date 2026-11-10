/*
 * Smart plugin search: finds plugins by what you want them to do ("hide people's bios", "see who deleted a message"),
 * not just by exact words. Runs instantly on this PC: words are trimmed to their stem, Discord slang and synonyms are
 * expanded, and each plugin is scored by how well its name, description and settings match.
 * "Ask Capri" (askCapri) goes further with her brain for questions the matcher can't place.
 */
import type { PluginInstance } from "./core/plugins";
import { native } from "./core/native";
import { settings } from "./core/settings";

const STOP = new Set("a an the i me my to of for in on at and or is are be it its that this with want wanna can could would how do does make let see show stop get when who what which from by into out up any some all".split(" "));

/** Groups of words that mean the same thing in a Discord-y way */
const SYNONYMS: string[][] = [
    ["delete", "deleted", "remove", "removed", "erase", "logger", "log", "history", "edit", "edited"],
    ["hide", "hidden", "remove", "clutter", "clean", "cleanup", "declutter", "block", "mute"],
    ["bio", "about", "profile", "status", "pronoun", "banner"],
    ["avatar", "pfp", "picture", "icon", "image"],
    ["ping", "mention", "notify", "notification", "alert", "@"],
    ["dm", "dms", "direct", "private", "message", "pm"],
    ["read", "unread", "seen", "badge", "count"],
    ["theme", "color", "colour", "appearance", "look", "css", "style", "font"],
    ["voice", "call", "vc", "audio", "volume", "sound", "mic"],
    ["translate", "language", "translation"],
    ["link", "url", "embed", "preview"],
    ["typing", "type", "typer"],
    ["copy", "clipboard"],
    ["server", "guild", "folder"],
    ["timestamp", "time", "date", "clock"],
    ["friend", "friends", "relationship", "online"],
    ["emoji", "sticker", "reaction", "react"],
    ["image", "media", "picture", "video", "gif", "file", "attachment", "upload"],
    ["privacy", "track", "tracking", "analytics", "telemetry"],
    ["spoiler", "blur", "nsfw"],
    ["reply", "respond", "quote"],
    ["animation", "motion", "animate"],
];

/** Trims endings so "deleted", "deleting", "deletes" all match "delete" */
function stem(w: string) {
    w = w.toLowerCase().replace(/[^a-z0-9@]/g, "");
    for (const end of ["ings", "ing", "ers", "er", "ies", "ied", "ed", "es", "s"]) {
        if (w.length > end.length + 2 && w.endsWith(end)) return end === "ies" || end === "ied" ? w.slice(0, -3) + "y" : w.slice(0, -end.length);
    }
    return w;
}

const synonymIndex = new Map<string, Set<string>>();
for (const group of SYNONYMS) {
    const stems = group.map(stem);
    for (const s of stems) {
        let set = synonymIndex.get(s);
        if (!set) synonymIndex.set(s, set = new Set());
        for (const o of stems) set.add(o);
    }
}

const words = (text: string) => text.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9@]+/i).filter(Boolean).map(stem);

/** Splits a plugin name like "MessageLogger" into words too */
const nameWords = (name: string) => words(name.replace(/([a-z])([A-Z])/g, "$1 $2"));

const docCache = new WeakMap<PluginInstance, { name: Set<string>; text: Set<string> }>();
function doc(p: PluginInstance) {
    let d = docCache.get(p);
    if (!d) {
        const opts = Object.values(p.options || {}).flatMap(o => [o.label ?? "", o.description ?? ""]).join(" ");
        d = { name: new Set(nameWords(p.name)), text: new Set(words(`${p.description ?? ""} ${p.category ?? ""} ${opts}`)) };
        docCache.set(p, d);
    }
    return d;
}

/** How well a plugin matches a request (0 = not at all) */
export function score(p: PluginInstance, query: string): number {
    const q = words(query).filter(w => !STOP.has(w));
    if (!q.length) return 0;
    const d = doc(p);
    let total = 0;
    for (const w of q) {
        const alts = synonymIndex.get(w) ?? new Set([w]);
        let best = 0;
        for (const a of alts) {
            const exact = a === w ? 1 : 0.6;
            if (d.name.has(a)) best = Math.max(best, 3 * exact);
            else if (d.text.has(a)) best = Math.max(best, 1 * exact);
            else if (a.length > 3) {
                for (const n of d.name) if (n.startsWith(a) || a.startsWith(n) && n.length > 3) { best = Math.max(best, 2 * exact); break; }
            }
        }
        total += best;
    }
    // Reward matching most of what was asked
    const covered = q.filter(w => [...(synonymIndex.get(w) ?? [w])].some(a => d.name.has(a) || d.text.has(a))).length;
    return total * (0.5 + covered / q.length);
}

/** Plugins ranked for a request, best first */
export function rank(list: PluginInstance[], query: string) {
    return list.map(p => ({ p, s: score(p, query) })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s).map(x => x.p);
}

/** Asks Capri's brain which plugins fit a request. Returns plugin names (best first). */
export async function askCapri(list: PluginInstance[], query: string): Promise<string[]> {
    const catalog = list.map(p => `${p.name}: ${(p.description ?? "").slice(0, 90)}`).join("\n");
    const answer = await native.aiChat(
        "You pick Discord client-mod plugins. Reply with only the names of up to 3 plugins from the list that best do what the user wants, comma-separated, best first. If none fit, reply NONE.",
        [{ role: "user", content: `Plugins:\n${catalog}\n\nWhat the user wants: ${query}` }], 60,
        // Online only if they chose that for Capri (their own key, if any, is used either way)
        settings.plugins?.Capri?.options?.brainMode === "online" ? "online" : "offline");
    const names = new Map(list.map(p => [p.name.toLowerCase(), p.name]));
    return answer.split(/[,\n]/).map(s => s.trim().replace(/[^\w]/g, "").toLowerCase()).map(s => names.get(s)).filter(Boolean) as string[];
}
