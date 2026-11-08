// Plugins that rewrite messages as you send them. All run on the outgoing request only.
import { definePlugin, net, common, SEND_URL, SEND_OR_EDIT_URL, escapeRegExp } from "@api";

/** Rewrites `content` of sent (and optionally edited) messages, skipping code spans/blocks. */
function contentTransformer(fn: (text: string) => string, { edits = true, skipCode = true } = {}) {
    return net.transform(({ method, url, body }) => {
        const okUrl = edits ? SEND_OR_EDIT_URL.test(url) && /^(POST|PATCH)$/.test(method) : SEND_URL.test(url) && method === "POST";
        if (!okUrl) return;
        const data = JSON.parse(body);
        if (typeof data.content !== "string" || !data.content) return;
        const out = skipCode
            ? data.content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part: string, i: number) => i % 2 ? part : fn(part)).join("")
            : fn(data.content);
        if (out === data.content) return;
        data.content = out;
        return JSON.stringify(data);
    });
}

/** Applies fn to every whitespace-separated word that isn't a link, mention, emoji or command. */
const plainWords = (text: string, fn: (w: string) => string) =>
    text.split(/(\s+)/).map(w => /^\s+$/.test(w) || /:\/\/|^<.*>$|^:\w+:$/.test(w) ? w : fn(w)).join("");

/* ------------------------------------------------------------------ links */
const EMBED_FIXES: Record<string, [RegExp, string]> = {
    twitter: [/^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\//i, "https://fxtwitter.com/"],
    instagram: [/^https?:\/\/(?:www\.)?instagram\.com\//i, "https://ddinstagram.com/"],
    tiktok: [/^https?:\/\/(?:www\.|vm\.)?tiktok\.com\//i, "https://tnktok.com/"],
    reddit: [/^https?:\/\/(?:www\.|old\.)?reddit\.com\//i, "https://rxddit.com/"],
    bluesky: [/^https?:\/\/bsky\.app\//i, "https://bskx.app/"],
    pixiv: [/^https?:\/\/(?:www\.)?pixiv\.net\//i, "https://phixiv.net/"],
};

export default [
    definePlugin({
        name: "FixEmbeds",
        description: "Swaps Twitter/X, Instagram, TikTok, Reddit, Bluesky and Pixiv links for versions that show a proper preview in Discord.",
        authors: ["Vanta"], category: "Chat",
        options: Object.fromEntries(Object.keys(EMBED_FIXES).map(k => [k, { type: "boolean" as const, default: true, label: k[0].toUpperCase() + k.slice(1) }])),
        start() {
            this.off = contentTransformer(text => text.replace(/https?:\/\/[^\s<>]+/g, link => {
                for (const [key, [re, to]] of Object.entries(EMBED_FIXES)) if (this.settings[key] && re.test(link)) return link.replace(re, to);
                return link;
            }), { edits: true });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "YouTubeShortLinks",
        description: "Turns youtube.com/watch?v=… links into short youtu.be links (keeps the timestamp).",
        authors: ["Vanta"], category: "Chat",
        start() {
            this.off = contentTransformer(text => text.replace(/https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^\s<>]+/gi, link => {
                try {
                    const u = new URL(link);
                    const id = u.searchParams.get("v");
                    if (!id) return link;
                    const t = u.searchParams.get("t");
                    return `https://youtu.be/${id}${t ? "?t=" + t : ""}`;
                } catch { return link; }
            }));
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "SuppressEmbeds",
        description: "Sends links without a preview underneath (like wrapping every link in < >).",
        authors: ["Vanta"], category: "Chat",
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (method !== "POST" || !SEND_URL.test(url)) return;
                const data = JSON.parse(body);
                if (!/https?:\/\//.test(data.content || "")) return;
                data.flags = (data.flags || 0) | 4; // SUPPRESS_EMBEDS
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "SafeMentions",
        description: "Stops your messages from pinging @everyone, @here or roles by accident (the text still shows).",
        authors: ["Vanta"], category: "Chat",
        options: {
            everyone: { type: "boolean", default: true, label: "Never ping @everyone / @here" },
            roles: { type: "boolean", default: false, label: "Never ping roles" },
        },
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (method !== "POST" || !SEND_URL.test(url)) return;
                const data = JSON.parse(body);
                const hasEveryone = /@(everyone|here)\b/.test(data.content || "");
                const hasRole = /<@&\d+>/.test(data.content || "");
                if (!(this.settings.everyone && hasEveryone) && !(this.settings.roles && hasRole)) return;
                const am = data.allowed_mentions ?? { parse: ["users", "roles", "everyone"] };
                am.parse = (am.parse ?? ["users", "roles", "everyone"]).filter((p: string) =>
                    !(p === "everyone" && this.settings.everyone) && !(p === "roles" && this.settings.roles));
                // Explicit allowed_mentions defaults replied_user to false; keep reply pings as they were.
                if (data.message_reference && am.replied_user === undefined) am.replied_user = true;
                data.allowed_mentions = am;
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "TextEffects",
        description: "Start a message with !owo, !mock, !up, !rev, !wide, !small, !clap or !spoil to transform it.",
        authors: ["Vanta"], category: "Chat",
        EFFECTS: {
            owo: (t: string) => t.replace(/[rl]/g, "w").replace(/[RL]/g, "W").replace(/n([aeiou])/g, "ny$1").replace(/ove/g, "uv") + " owo",
            mock: (t: string) => { let i = 0; return t.replace(/[a-z]/gi, c => (i++ % 2 ? c.toUpperCase() : c.toLowerCase())); },
            up: (t: string) => t.toUpperCase(),
            rev: (t: string) => [...t].reverse().join(""),
            wide: (t: string) => t.replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　"),
            small: (t: string) => t.replace(/[a-z]/g, c => "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"[c.charCodeAt(0) - 97]),
            clap: (t: string) => t.trim().split(/\s+/).join(" 👏 "),
            spoil: (t: string) => plainWords(t, w => `||${w}||`),
        } as Record<string, (t: string) => string>,
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (method !== "POST" || !SEND_URL.test(url)) return;
                const data = JSON.parse(body);
                const m = String(data.content || "").match(/^!(\w+)\s+([\s\S]+)$/);
                const fx = m && this.EFFECTS[m[1].toLowerCase()];
                if (!fx) return;
                data.content = fx(m![2]);
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "SmartPunctuation",
        description: "Typographer's touches: -- becomes —, ... becomes …, -> becomes →.",
        authors: ["Vanta"], category: "Chat",
        start() {
            this.off = contentTransformer(text => plainWords(text, w =>
                w.replace(/(^|[^-])--(?!-)/g, "$1—").replace(/\.\.\.(?!\.)/g, "…").replace(/->/g, "→").replace(/<-(?!>)/g, "←").replace(/=>/g, "⇒")));
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "InlineCalc",
        description: "Write {= 12*4 + 3} in a message and it's replaced with the answer when you send.",
        authors: ["Vanta"], category: "Chat",
        options: { showExpr: { type: "boolean", default: false, label: "Keep the sum", description: "Send \"12*4+3 = 51\" instead of just \"51\"." } },
        /** Safe arithmetic: numbers, + - * / % ^, parentheses. No eval. */
        calc(expr: string): number | null {
            const tokens = expr.match(/\d+(?:\.\d+)?|[-+*/%^()]/g);
            if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) return null;
            let i = 0;
            const peek = () => tokens[i], next = () => tokens[i++];
            const primary = (): number => {
                const t = next();
                if (t === "(") { const v = add(); if (next() !== ")") throw 0; return v; }
                if (t === "-") return -primary();
                if (t === "+") return primary();
                const n = Number(t);
                if (Number.isNaN(n)) throw 0;
                return n;
            };
            const pow = (): number => { const b = primary(); return peek() === "^" ? (next(), b ** pow()) : b; };
            const mul = (): number => {
                let v = pow();
                while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); const r = pow(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; }
                return v;
            };
            const add = (): number => {
                let v = mul();
                while (peek() === "+" || peek() === "-") { const op = next(); const r = mul(); v = op === "+" ? v + r : v - r; }
                return v;
            };
            try { const v = add(); return i === tokens.length && Number.isFinite(v) ? v : null; } catch { return null; }
        },
        start() {
            this.off = contentTransformer(text => text.replace(/\{=\s*([^{}]{1,120})\}/g, (whole, expr) => {
                const v = this.calc(expr);
                if (v === null) return whole;
                const n = String(Math.round(v * 1e10) / 1e10);
                return this.settings.showExpr ? `${expr.trim()} = ${n}` : n;
            }));
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "Signature",
        description: "Adds a signature line to the end of messages you send.",
        authors: ["Vanta"], category: "Chat",
        options: {
            text: { type: "string", default: "", label: "Signature", placeholder: "— sent from Vanta" },
            serversOnly: { type: "boolean", default: false, label: "Only in servers", description: "Don't add it in DMs." },
            subtext: { type: "boolean", default: true, label: "Small text", description: "Use Discord's -# small text." },
        },
        start() {
            this.off = net.transform(({ method, url, body }) => {
                const m = method === "POST" && url.match(SEND_URL);
                const sig = String(this.settings.text || "").trim();
                if (!m || !sig) return;
                if (this.settings.serversOnly && !common.ChannelStore?.getChannel?.(m[1])?.guild_id) return;
                const data = JSON.parse(body);
                if (typeof data.content !== "string" || !data.content.trim() || data.content.startsWith("/")) return;
                data.content = `${data.content}\n${this.settings.subtext ? "-# " : ""}${sig}`;
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "AutoCapitalize",
        description: "Capitalizes the first letter of your messages (and optionally adds a full stop).",
        authors: ["Vanta"], category: "Chat",
        options: { period: { type: "boolean", default: false, label: "Add a full stop", description: "If the message ends with a letter." } },
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (method !== "POST" || !SEND_URL.test(url)) return;
                const data = JSON.parse(body);
                let c: string = data.content || "";
                if (!c || /^(https?:\/\/|<|`|\/|:|!|>)/.test(c)) return;
                c = c.replace(/^\p{Ll}/u, ch => ch.toUpperCase());
                if (this.settings.period && /\p{L}$/u.test(c) && !c.includes("\n")) c += ".";
                if (c === data.content) return;
                data.content = c;
                return JSON.stringify(data);
            });
        },
        stop() { this.off?.(); },
    }),
    definePlugin({
        name: "SpoilerUploads",
        description: "Marks every file you upload as a spoiler.",
        authors: ["Vanta"], category: "Chat",
        spoil: (name: string) => (name && !name.startsWith("SPOILER_") ? "SPOILER_" + name : name),
        start() {
            this.off = net.transform(({ method, url, body }) => {
                if (method !== "POST") return;
                const upload = /\/channels\/\d+\/attachments$/.test(url), message = SEND_URL.test(url);
                if (!upload && !message) return;
                if (typeof body === "string") {
                    const data = JSON.parse(body);
                    const list = upload ? data.files : data.attachments;
                    if (!Array.isArray(list) || !list.length) return;
                    for (const f of list) if (f.filename) f.filename = this.spoil(f.filename);
                    return JSON.stringify(data);
                }
                if (body instanceof FormData) {
                    const out = new FormData();
                    let changed = false;
                    for (const [k, v] of body.entries()) {
                        if (v instanceof File) { out.append(k, new File([v], this.spoil(v.name), { type: v.type })); changed = true; }
                        else if (k === "payload_json") {
                            try { const p = JSON.parse(v as string); for (const a of p.attachments || []) if (a.filename) a.filename = this.spoil(a.filename); out.append(k, JSON.stringify(p)); }
                            catch { out.append(k, v); }
                        } else out.append(k, v);
                    }
                    return changed ? out : undefined;
                }
            }, { anyBody: true });
        },
        stop() { this.off?.(); },
    }),
];

void escapeRegExp;
