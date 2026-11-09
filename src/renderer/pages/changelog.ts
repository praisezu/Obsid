/*
 * Update log: what changed in each Vanta release, from the GitHub releases (the notes written on each version tag).
 */
import { native, cleanError } from "../core/native";
import { ui, h } from "../ui/components";

interface Release { tag: string; name: string; date: string; notes: string; url: string }
let cache: { at: number; list: Release[] } | null = null;

async function releases(force = false): Promise<Release[]> {
    if (cache && !force && Date.now() - cache.at < 10 * 60_000) return cache.list;
    const raw = JSON.parse(await native.fetchText(`https://api.github.com/repos/${__VANTA_REPO__}/releases?per_page=30`));
    const list: Release[] = (Array.isArray(raw) ? raw : []).filter((r: any) => !r.draft).map((r: any) => ({
        tag: String(r.tag_name ?? ""), name: String(r.name || r.tag_name || ""), date: String(r.published_at ?? ""),
        notes: String(r.body ?? ""), url: String(r.html_url ?? ""),
    }));
    cache = { at: Date.now(), list };
    return list;
}

/** Release notes are short "- item" lists; show them as a real list, and other lines as text */
function notes(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return h("div", { class: "vanta-item-desc" }, "No notes for this version.");
    const items = lines.filter(l => /^[-*•]\s+/.test(l)).map(l => l.replace(/^[-*•]\s+/, ""));
    const other = lines.filter(l => !/^[-*•]\s+/.test(l));
    return h("div", {},
        other.length ? h("div", { class: "vanta-item-desc", style: { marginBottom: "6px" } }, other.join(" ")) : null,
        items.length ? h("ul", { style: { margin: "0", paddingLeft: "20px", lineHeight: "22px", fontSize: "14px", color: "var(--text-normal)" } }, items.map(i => h("li", {}, i))) : null);
}

ui.registerPage({
    id: "changelog",
    label: "Update log",
    icon: "info",
    order: 4.5,
    keywords: ["changelog", "update log", "what's new", "whats new", "release notes", "history", "version"],
    render(ctx) {
        const st = ctx.state as { list?: Release[]; error?: string; loading?: boolean };
        const body = h("div", { style: { display: "contents" } });
        const root = h("div", { class: "vanta-page" }, ui.pageHead("Update log", "What changed in each version of Vanta."), body);
        const current = "v" + __VANTA_VERSION__;

        const draw = () => {
            if (st.error) { body.replaceChildren(ui.note("danger", "Couldn't load the update log: " + st.error), h("div", {}, ui.button("Try again", { icon: "refresh", onClick: () => load(true) }))); return; }
            if (!st.list) { body.replaceChildren(ui.empty("Loading the update log…", "info")); return; }
            if (!st.list.length) { body.replaceChildren(ui.empty("No releases yet.", "info")); return; }
            body.replaceChildren(
                h("div", { class: "vanta-btns" },
                    ui.button(st.loading ? "Refreshing…" : "Refresh", { small: true, variant: "ghost", icon: "refresh", onClick: () => load(true) }),
                    ui.button("All releases on GitHub", { small: true, variant: "ghost", icon: "globe", onClick: () => native.openUrl(`https://github.com/${__VANTA_REPO__}/releases`) })),
                h("div", { class: "vanta-list" }, st.list.map(r => {
                    const tags: Node[] = [];
                    if (r.tag === current) tags.push(ui.tag("Installed", "ok", "The version you're running"));
                    else if (st.list![0] === r) tags.push(ui.tag("Latest"));
                    const when = r.date ? new Date(r.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
                    return ui.card({ class: "vanta-pad" },
                        h("div", { class: "vanta-item-top" },
                            h("div", { class: "vanta-item-name" }, r.name, tags),
                            h("span", { class: "vanta-item-desc" }, when)),
                        notes(r.notes));
                })));
        };

        const load = async (force = false) => {
            st.loading = true; st.error = undefined; draw();
            try { st.list = await releases(force); }
            catch (e) { st.error = cleanError(e); }
            st.loading = false;
            if (root.isConnected || !st.list) draw();
        };

        draw();
        if (!st.list) load(); else draw();
        return root;
    },
});
