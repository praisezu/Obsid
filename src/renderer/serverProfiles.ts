/*
 * Per-server profiles: a different theme, extra CSS, and plugins paused in particular servers (a quiet setup for a
 * school server, the full set for friends). It only changes things while you're in that server; your normal
 * settings are untouched, and paused plugins come back when you leave.
 *
 * Cheap: it runs only when you switch servers, and only does something if that server has a profile.
 */
import { settings, saveSettings } from "./core/settings";
import { plugins, isPluginEnabled, startPlugin, stopPlugin } from "./core/plugins";
import { onFlux } from "./core/flux";
import { common } from "./core/common";
import { ready as webpackReady } from "./core/webpack";
import { themes } from "./themes";
import { logger } from "./core/logger";
import { ui, h } from "./ui/components";

export interface ServerProfile { theme?: string | null; css?: string; off?: string[] }
/** theme: undefined = keep your theme, null = no theme here, "file.theme.css" = that theme here */

const profiles = () => (settings.vanta.serverProfiles ??= {});
let activeGuild: string | null = null;
const paused = new Set<string>();
let cssEl: HTMLStyleElement | null = null;
let themeEl: HTMLStyleElement | null = null;

function apply(guildId: string | null) {
    const p: ServerProfile | undefined = guildId ? profiles()[guildId] : undefined;
    // Plugins: resume the ones paused for the last server, pause the ones this server wants off
    const off = new Set((p?.off ?? []).filter(n => isPluginEnabled(n)));
    for (const name of [...paused]) {
        if (off.has(name)) continue;
        paused.delete(name);
        const pl = plugins.get(name);
        if (pl && isPluginEnabled(name)) startPlugin(pl);
    }
    for (const name of off) {
        const pl = plugins.get(name);
        if (pl?.started && !paused.has(name)) { paused.add(name); stopPlugin(pl); }
    }
    // Extra CSS for this server
    if (p?.css) {
        cssEl ??= Object.assign(document.createElement("style"), { id: "vanta-server-css" });
        cssEl.textContent = p.css;
        document.head.append(cssEl);
    } else { cssEl?.remove(); cssEl = null; }
    // Theme override: hide the normal theme's <style> and show this one
    const override = p && p.theme !== undefined;
    for (const el of document.querySelectorAll<HTMLStyleElement>("style[data-vanta-theme]")) el.media = override ? "not all" : "";
    if (override && p!.theme) {
        const t = themes.local.find(x => x.file === p!.theme);
        themeEl ??= Object.assign(document.createElement("style"), { id: "vanta-server-theme" });
        themeEl.textContent = t?.css ?? "";
        document.head.append(themeEl);
    } else { themeEl?.remove(); themeEl = null; }
}

export function startServerProfiles() {
    webpackReady.then(() => {
        try {
            onFlux("CHANNEL_SELECT", ({ guildId }: any) => {
                const g = guildId ?? null;
                if (g === activeGuild) return;
                activeGuild = g;
                if (Object.keys(profiles()).length || paused.size || cssEl || themeEl) apply(g);
            });
            activeGuild = common.SelectedGuildStore?.getGuildId?.() ?? null;
            if (Object.keys(profiles()).length) setTimeout(() => apply(activeGuild), 3000); // after plugins have started
        } catch (e) { logger.warn("Server profiles couldn't start:", e); }
    });
}

/** Settings UI for one server's profile */
function editor(guildId: string, onChange: () => void) {
    const p: ServerProfile = profiles()[guildId] ?? {};
    const save = () => {
        const clean: ServerProfile = {};
        if (p.theme !== undefined) clean.theme = p.theme;
        if (p.css?.trim()) clean.css = p.css;
        if (p.off?.length) clean.off = p.off;
        if (Object.keys(clean).length) profiles()[guildId] = clean; else delete profiles()[guildId];
        saveSettings();
        if (activeGuild === guildId) apply(guildId);
        onChange();
    };
    const themeSel = h("select", { class: "vanta-input", style: { width: "auto" }, "aria-label": "Theme in this server" },
        h("option", { value: "__keep" }, "Keep my theme"),
        h("option", { value: "__none", selected: p.theme === null ? true : null }, "No theme here"),
        themes.local.map(t => h("option", { value: t.file, selected: p.theme === t.file ? true : null }, t.file)));
    if (p.theme === undefined) themeSel.value = "__keep";
    themeSel.addEventListener("change", () => { p.theme = themeSel.value === "__keep" ? undefined : themeSel.value === "__none" ? null : themeSel.value; save(); });

    const css = h("textarea", { class: "vanta-input", rows: 5, placeholder: "/* CSS only for this server */", style: { fontFamily: "Consolas, ui-monospace, monospace", width: "100%" } }) as HTMLTextAreaElement;
    css.value = p.css ?? "";
    let t: ReturnType<typeof setTimeout>;
    css.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { p.css = css.value; save(); }, 400); });
    css.addEventListener("keydown", e => e.stopPropagation());

    const on = [...plugins.values()].filter(x => isPluginEnabled(x.name)).sort((a, b) => a.name.localeCompare(b.name));
    const list = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px", maxHeight: "240px", overflowY: "auto" } },
        on.map(x => {
            const box = h("input", { type: "checkbox", checked: p.off?.includes(x.name) ? true : null }) as HTMLInputElement;
            box.addEventListener("change", () => { p.off = box.checked ? [...(p.off ?? []), x.name] : (p.off ?? []).filter(n => n !== x.name); save(); });
            return h("label", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "14px" } }, box, x.name);
        }));
    return h("div", { style: { display: "grid", gap: "12px" } },
        h("div", {}, h("div", { class: "vanta-item-name", style: { marginBottom: "6px" } }, "Theme here"), themeSel),
        h("div", {}, h("div", { class: "vanta-item-name", style: { marginBottom: "6px" } }, "Extra CSS here"), css),
        h("div", {}, h("div", { class: "vanta-item-name", style: { marginBottom: "6px" } }, "Pause these plugins here"),
            on.length ? list : ui.empty("Turn some plugins on first.", "plugins")));
}

ui.registerPage({
    id: "server-profiles",
    label: "Server profiles",
    icon: "sliders",
    order: 3.5,
    keywords: ["profile", "per server", "server theme", "school", "different settings"],
    render(ctx) {
        const st = ctx.state as { guild?: string };
        const guilds = Object.values(common.GuildStore?.getGuilds?.() ?? {}).sort((a: any, b: any) => a.name.localeCompare(b.name)) as any[];
        st.guild ??= common.SelectedGuildStore?.getGuildId?.() ?? guilds[0]?.id;
        const body = h("div", {});
        const summary = h("div", { class: "vanta-item-desc" });
        const drawSummary = () => {
            const set = Object.keys(profiles()).map(id => common.GuildStore?.getGuild?.(id)?.name).filter(Boolean);
            summary.textContent = set.length ? `Servers with a profile: ${set.join(", ")}` : "No server has a profile yet.";
        };
        const sel = h("select", { class: "vanta-input", style: { width: "auto", minWidth: "220px" }, "aria-label": "Server" },
            guilds.map(g => h("option", { value: g.id, selected: g.id === st.guild ? true : null }, (profiles()[g.id] ? "● " : "") + g.name)));
        const draw = () => body.replaceChildren(st.guild ? editor(st.guild, drawSummary) : ui.empty("You're not in any servers.", "info"));
        sel.addEventListener("change", () => { st.guild = sel.value; draw(); });
        drawSummary(); draw();
        return h("div", { class: "vanta-page" },
            ui.pageHead("Server profiles", "A different theme, extra CSS, or fewer plugins in particular servers. It switches when you open that server."),
            h("div", { class: "vanta-toolbar" }, sel), summary, ui.card({ class: "vanta-pad" }, body));
    },
});
