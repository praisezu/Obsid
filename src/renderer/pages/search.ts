/*
 * Search: messages Discord has loaded this session, your MessageLogger history (deleted and edited messages) and
 * your bookmarks, all in one place, with filters Discord's own search doesn't offer for some of these.
 * Runs on this PC only, when you press Enter (never on every keystroke).
 */
import { ui, h } from "../ui/components";
import { common } from "../core/common";
import { discord } from "../core/discord";
import { storage } from "../core/storage";

interface Hit { source: "message" | "deleted" | "edited" | "bookmark"; author: string; authorId?: string; content: string; where: string; at: number; channelId?: string; messageId?: string; image: boolean; link: boolean; file: boolean; dm: boolean }

const FILTERS: [string, string][] = [["from:me", "Sent by you"], ["has:image", "Has an image"], ["has:link", "Has a link"], ["has:file", "Has a file"], ["in:dms", "In DMs"], ["is:deleted", "Deleted"], ["is:edited", "Edited"], ["is:bookmark", "Bookmarked"]];
const nameOf = (u: any) => u?.globalName || u?.global_name || u?.username || "Unknown";
const IMG = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;

function loadedMessages(): Hit[] {
    const out: Hit[] = [];
    const sample = common.MessageStore?.getMessages?.(common.SelectedChannelStore?.getChannelId?.() ?? "0");
    const all: Record<string, any> = sample?.constructor?._channelMessages ?? {};
    for (const [channelId, cm] of Object.entries(all)) {
        const ch = common.ChannelStore?.getChannel?.(channelId);
        const guild = ch?.guild_id ? common.GuildStore?.getGuild?.(ch.guild_id)?.name : null;
        const where = ch ? (guild ? `#${ch.name} · ${guild}` : ch.name || "DM") : "Unknown channel";
        const dm = !!ch && (ch.type === 1 || ch.type === 3);
        for (const m of (cm as any)?._array ?? []) {
            const atts = m.attachments ?? [];
            out.push({
                source: "message", author: nameOf(m.author), authorId: m.author?.id, content: String(m.content ?? ""), where, dm,
                at: new Date(m.timestamp).getTime() || 0, channelId, messageId: m.id,
                image: atts.some((a: any) => IMG.test(a.filename ?? a.url ?? "")) || (m.embeds ?? []).some((e: any) => e.image || e.thumbnail),
                link: /https?:\/\//.test(m.content ?? ""), file: atts.length > 0,
            });
        }
    }
    return out;
}

async function everything(): Promise<Hit[]> {
    const me = common.UserStore?.getCurrentUser?.();
    const hits = loadedMessages();
    for (const e of (await storage.get<any[]>("MessageLogger")) ?? []) {
        hits.push({
            source: e.kind === "edited" ? "edited" : "deleted", author: e.author ?? "Unknown", content: e.kind === "edited" ? `${e.content} → ${e.after}` : String(e.content ?? ""),
            where: e.where ?? "", at: Date.parse(e.at) || 0, image: (e.attachments ?? []).some((a: string) => IMG.test(a)), link: /https?:\/\//.test(e.content ?? ""),
            file: (e.attachments ?? []).length > 0, dm: /^DM|^[^#]/.test(e.where ?? ""), authorId: e.author === nameOf(me) ? me?.id : undefined,
        });
    }
    for (const b of (await storage.get<any[]>("Bookmarks")) ?? []) {
        hits.push({ source: "bookmark", author: b.author, content: b.content, where: b.where, at: b.at, channelId: b.channelId, messageId: b.messageId, image: false, link: /https?:\/\//.test(b.content ?? ""), file: b.files > 0, dm: !/#/.test(b.where ?? "") });
    }
    return hits;
}

function matches(hit: Hit, words: string[], filters: Set<string>, me: string | undefined) {
    if (filters.has("from:me") && hit.authorId !== me) return false;
    if (filters.has("has:image") && !hit.image) return false;
    if (filters.has("has:link") && !hit.link) return false;
    if (filters.has("has:file") && !hit.file) return false;
    if (filters.has("in:dms") && !hit.dm) return false;
    if (filters.has("is:deleted") && hit.source !== "deleted") return false;
    if (filters.has("is:edited") && hit.source !== "edited") return false;
    if (filters.has("is:bookmark") && hit.source !== "bookmark") return false;
    const text = `${hit.content} ${hit.author} ${hit.where}`.toLowerCase();
    return words.every(w => text.includes(w));
}

ui.registerPage({
    id: "search",
    label: "Search",
    icon: "search",
    order: 2.6,
    keywords: ["search", "find message", "deleted", "bookmarks", "history"],
    render(ctx) {
        const st = ctx.state as { q?: string; filters?: string[] };
        st.q ??= ""; st.filters ??= [];
        const results = h("div", {});
        const input = h("input", { class: "vanta-input", placeholder: "Search messages, then press Enter (try: from:me has:image)", value: st.q, style: { flex: "1" } }) as HTMLInputElement;
        const chips = h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } });
        const drawChips = () => chips.replaceChildren(...FILTERS.map(([f, label]) => {
            const on = st.filters!.includes(f);
            return ui.button(label, { small: true, variant: on ? "primary" : "ghost", onClick: () => { st.filters = on ? st.filters!.filter(x => x !== f) : [...st.filters!, f]; drawChips(); run(); } });
        }));

        const run = async () => {
            st.q = input.value;
            const typed = st.q.toLowerCase().split(/\s+/).filter(Boolean);
            const filters = new Set([...st.filters!, ...typed.filter(w => FILTERS.some(([f]) => f === w))]);
            const words = typed.filter(w => !filters.has(w));
            if (!words.length && !filters.size) { results.replaceChildren(ui.empty("Type something or pick a filter.", "search")); return; }
            results.replaceChildren(ui.empty("Searching…", "search"));
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const hits = (await everything()).filter(x => matches(x, words, filters, me)).sort((a, b) => b.at - a.at);
            const shown = hits.slice(0, 100);
            results.replaceChildren(
                h("div", { class: "vanta-item-desc", style: { margin: "4px 0 8px" } }, `${hits.length} result${hits.length === 1 ? "" : "s"}${hits.length > 100 ? " (showing the newest 100)" : ""} · loaded messages, MessageLogger history and bookmarks`),
                shown.length ? h("div", { style: { display: "grid", gap: "8px" } }, shown.map(x => ui.card({ class: "vanta-pad" },
                    h("div", { class: "vanta-item-top" },
                        h("div", { class: "vanta-item-name" }, x.author,
                            x.source !== "message" ? ui.tag(x.source === "deleted" ? "Deleted" : x.source === "edited" ? "Edited" : "Bookmark", x.source === "deleted" ? "danger" : "") : null,
                            h("span", { class: "vanta-item-desc", style: { marginLeft: "8px", fontWeight: "400" } }, `${x.where}${x.at ? " · " + new Date(x.at).toLocaleString() : ""}`)),
                        x.channelId ? ui.button("Jump", { small: true, variant: "ghost", onClick: () => discord.jumpTo(x.channelId!, x.messageId) }) : null),
                    h("div", { class: "vanta-item-desc", style: { whiteSpace: "pre-wrap", color: "var(--text-normal)" } }, x.content.slice(0, 600) || "[attachment]"))))
                    : ui.empty("Nothing found.", "search"));
        };
        input.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") run(); });
        drawChips();
        if (st.q || st.filters.length) run(); else results.replaceChildren(ui.empty("Search what Discord has loaded, your MessageLogger history and your bookmarks.", "search"));
        return h("div", { class: "vanta-page" },
            ui.pageHead("Search", "Find messages, including deleted and edited ones (with MessageLogger on) and your bookmarks."),
            h("div", { class: "vanta-toolbar" }, input, ui.button("Search", { variant: "primary", icon: "search", onClick: run })),
            chips, results);
    },
});
