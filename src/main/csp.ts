/*
 * Lets themes load their CSS, fonts and images from other websites.
 *
 * Discord's Content-Security-Policy blocks stylesheets from other origins, so BetterDiscord-style
 * themes that `@import url(https://…)` their real CSS silently load nothing. We relax only the
 * style/font/image/media directives. script-src and everything else stay exactly as Discord sent them.
 *
 * Electron allows one onHeadersReceived listener per session; later calls replace earlier ones.
 * We register first and wrap whatever Discord (or another mod) registers after us, so theirs
 * still runs and ours post-processes its result.
 */
import { session, type OnHeadersReceivedListenerDetails, type HeadersReceivedResponse } from "electron";

type Listener = (details: OnHeadersReceivedListenerDetails, callback: (response: HeadersReceivedResponse) => void) => void;

const RELAX: Record<string, string> = {
    "style-src": "* 'unsafe-inline' data: blob:",
    "style-src-elem": "* 'unsafe-inline' data: blob:",
    "style-src-attr": "* 'unsafe-inline'",
    "font-src": "* data: blob:",
    "img-src": "* data: blob:",
    "media-src": "* data: blob:",
};

export function relaxPolicy(policy: string) {
    const directives = policy.split(";").map(d => d.trim()).filter(Boolean);
    const seen = new Set<string>();
    const out = directives.map(d => {
        const name = d.split(/\s+/)[0].toLowerCase();
        seen.add(name);
        return RELAX[name] ? `${name} ${RELAX[name]}` : d;
    });
    // If a directive wasn't present it falls back to default-src; add explicit relaxed ones.
    for (const [name, value] of Object.entries(RELAX)) if (!seen.has(name)) out.push(`${name} ${value}`);
    return out.join("; ");
}

function relaxHeaders(headers: Record<string, string[] | string> | undefined) {
    if (!headers) return headers;
    for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (lower !== "content-security-policy" && lower !== "content-security-policy-report-only") continue;
        const value = headers[key];
        headers[key] = Array.isArray(value) ? value.map(relaxPolicy) : relaxPolicy(String(value));
    }
    return headers;
}

/** Simple Electron URL-pattern matcher ("*://*.discord.com/*" style) for wrapped listeners' filters. */
function matches(url: string, patterns?: string[]) {
    if (!patterns?.length) return true;
    return patterns.some(p => new RegExp("^" + p.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(url));
}

export function installCspPatch() {
    const wr = session.defaultSession.webRequest;
    let wrapped: { listener: Listener; urls?: string[] } | null = null;

    const ours: Listener = (details, callback) => {
        const finish = (response: HeadersReceivedResponse = {}) => {
            if (response.cancel) return callback(response);
            const headers = relaxHeaders((response.responseHeaders ?? details.responseHeaders) as any);
            callback({ ...response, responseHeaders: headers as any });
        };
        if (wrapped && matches(details.url, wrapped.urls)) {
            try { wrapped.listener(details, finish); } catch (e) { console.error("[Obsid] wrapped header listener threw", e); finish(); }
        } else finish();
    };

    const original = wr.onHeadersReceived.bind(wr) as (...a: any[]) => void;
    original(ours);
    // Anyone registering later gets composed with ours instead of replacing it.
    (wr as any).onHeadersReceived = (filterOrListener: any, maybeListener?: any) => {
        const listener = typeof filterOrListener === "function" ? filterOrListener : maybeListener;
        const urls = typeof filterOrListener === "function" ? undefined : filterOrListener?.urls;
        wrapped = listener ? { listener, urls } : null;
    };
}
