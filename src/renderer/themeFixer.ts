/*
 * Theme auto-fixer: keeps old BetterDiscord themes working after Discord renames its classes.
 *
 * Discord's class names look like `title_3zSH5d` (older ones: `title-3FQ39e`), and the random part changes with
 * Discord updates, which silently breaks themes. When a theme loads, any class in it that Discord no longer uses is
 * rewritten to match by its stable name part instead (`[class*="title_"]`), when Discord still has that name.
 * Themes that only `@import` their real CSS from a website are fetched and fixed too.
 *
 * No lag: the theme is shown as-is straight away, the fix runs off to the side once, and the result is cached.
 */
import { native } from "./core/native";
import { findAll } from "./core/webpack";
import { logger } from "./core/logger";

/** Discord's current hashed classes (full names) and their name parts */
let known: { full: Set<string>; names: Set<string> } | null = null;
function discordClasses() {
    if (known) return known;
    const full = new Set<string>(), names = new Set<string>();
    const re = /^([a-zA-Z][a-zA-Z0-9]*)_([a-zA-Z0-9_-]{5,7})$/;
    for (const mod of findAll(m => typeof m === "object" && m !== null && !Array.isArray(m))) {
        for (const key in mod) {
            let v: unknown;
            try { v = (mod as any)[key]; } catch { continue; }
            if (typeof v !== "string" || v.length > 200) continue;
            for (const c of v.split(" ")) {
                const m = re.exec(c);
                if (m) { full.add(c); names.add(m[1]); }
            }
        }
    }
    // Only trust it once Discord has loaded most of its styles
    if (full.size > 2000) known = { full, names };
    return { full, names };
}

/** Looks like a random hash: has a digit or capital letter (so `.app-mount` or `.theme-dark` are left alone) */
const hashy = (s: string) => /[0-9A-Z]/.test(s);

/** Rewrites retired class names. `known` is Discord's current classes (passed in by tests). */
export function fixClasses(css: string, known?: { full: Set<string>; names: Set<string> }): { css: string; fixed: number } {
    const { full, names } = known ?? discordClasses();
    let fixed = 0;
    // Leave url(...) and strings alone
    const out = css.replace(/(url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\.([a-zA-Z][a-zA-Z0-9]*)([-_])([a-zA-Z0-9_-]{5,7})(?![a-zA-Z0-9_-])/g,
        (match, skip, name, sep, hash) => {
            if (skip) return skip;
            // Only the old dash style (name-AbC123): Discord doesn't use it anymore, so it's surely outdated. Current-style
            // classes are never touched (some load later, so "not seen yet" doesn't mean "gone").
            if (sep !== "-" || !hashy(hash)) return match;
            if (!names.has(name) || full.has(`${name}-${hash}`)) return match;
            fixed++;
            // Classes that start with that name (not just contain it), so it doesn't spill onto unrelated elements
            return `:is([class^="${name}_"],[class*=" ${name}_"])`;
        });
    return { css: out, fixed };
}

/** Inlines `@import url(...)` of theme CSS from websites (not fonts), so the imported CSS can be fixed too */
async function inlineImports(css: string, depth = 0): Promise<string> {
    if (depth > 2) return css;
    // Relative links inside an imported file are relative to that file, not to Discord
    const absolute = (text: string, base: string) => text.replace(/url\(\s*(["']?)(?!data:|https?:|blob:|#)([^"')]+)\1\s*\)/g,
        (m, q, rel) => { try { return `url(${q}${new URL(rel, base).href}${q})`; } catch { return m; } });
    const re = /@import\s+(?:url\(\s*)?["']?(https:\/\/[^"')\s;]+)["']?\s*\)?\s*;/g;
    const urls = [...css.matchAll(re)].map(m => m[1]).filter(u => !/fonts\.googleapis|fonts\.bunny|use\.typekit/.test(u));
    if (!urls.length) return css;
    const got = new Map<string, string>();
    await Promise.all(urls.map(async u => {
        try { got.set(u, absolute(await inlineImports(await native.fetchText(u), depth + 1), u)); } catch { /* keep the @import as it was */ }
    }));
    let body = css.replace(re, (m, u) => got.has(u) ? `/* ${u} */\n${got.get(u)}\n` : m);
    // Anything still @import-ed (fonts) has to come first to be valid
    const left: string[] = [];
    body = body.replace(/@import[^;]+;/g, m => { left.push(m); return ""; });
    return left.join("\n") + "\n" + body;
}

const cache = new Map<string, Promise<string>>();

/**
 * Returns the fixed version of a theme's CSS (cached). Resolves to the original if nothing needed fixing or the fix
 * couldn't run, so callers can always use what comes back.
 */
export function fixTheme(css: string): Promise<string> {
    let p = cache.get(css);
    if (!p) {
        p = (async () => {
            try {
                const inlined = await inlineImports(css);
                // Nothing old-style anywhere (including what it imports)? Leave the theme exactly as it is.
                if (!/\.[a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9_-]{5,7}(?![a-zA-Z0-9_-])/.test(inlined)) return css;
                const { css: out, fixed } = fixClasses(inlined);
                if (fixed) logger.log(`Theme auto-fixer: updated ${fixed} outdated class name${fixed > 1 ? "s" : ""}`);
                return fixed ? out : css;
            } catch (e) { logger.warn("Theme auto-fixer failed, using the theme as it is:", e); return css; }
        })();
        cache.set(css, p);
    }
    return p;
}
