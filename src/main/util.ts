import * as path from "node:path";

/** Only allow plain file names (no folders, no "..") with the given extension. */
export function safeName(name: string, ext: string) {
    const base = path.basename(String(name));
    if (!base || base !== String(name) || !base.toLowerCase().endsWith(ext)) throw new Error("Invalid file name");
    return base;
}

/** Reads BetterDiscord-style metadata from a leading block comment: @name, @author, @version… */
export function parseMeta(css: string): Record<string, string> {
    const block = css.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    const meta: Record<string, string> = {};
    if (block) for (const m of block[1].matchAll(/@(\w+)[ \t]+([^\r\n]+)/g)) meta[m[1]] = m[2].trim();
    return meta;
}

/** Compares "1.2.3" style versions (a leading "v" is ignored). */
export function compareVersions(a: string, b: string) {
    const pa = a.replace(/^v/i, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
    const pb = b.replace(/^v/i, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return Math.sign(d);
    }
    return 0;
}
