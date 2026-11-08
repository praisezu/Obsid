/* "Create" tab on the Themes page: build a theme with colour pickers, previewed live on Discord. */
import { native, cleanError } from "../core/native";
import { copyText } from "../core/messages";
import { themes } from "../themes";
import { ui, h, type PageContext } from "../ui/components";

interface Field { key: string; label: string; vars: string[] }

const COLORS: Field[] = [
    { key: "bgLowest", label: "Darkest background (server list)", vars: ["--background-base-lowest"] },
    { key: "bgLower", label: "Sidebar background", vars: ["--background-base-lower", "--input-background-default"] },
    { key: "bgLow", label: "Chat background", vars: ["--background-base-low", "--chat-background-default", "--modal-background"] },
    { key: "surface", label: "Panels and cards", vars: ["--background-surface-high", "--card-background-default"] },
    { key: "surfaceHigher", label: "Raised panels", vars: ["--background-surface-higher", "--background-surface-highest"] },
    { key: "text", label: "Text", vars: ["--text-default", "--text-normal", "--header-primary", "--text-strong"] },
    { key: "muted", label: "Muted text", vars: ["--text-muted", "--header-secondary", "--channels-default"] },
    { key: "accent", label: "Accent (buttons, toggles)", vars: ["--brand-500", "--button-filled-brand-background", "--control-primary-background-default"] },
    { key: "link", label: "Links", vars: ["--text-link", "--control-brand-foreground"] },
];

const PRESETS: Record<string, Record<string, string>> = {
    Vantablack: { bgLowest: "#000000", bgLower: "#030304", bgLow: "#060608", surface: "#0b0b0e", surfaceHigher: "#101014", text: "#ececf1", muted: "#9b9aa6", accent: "#8b5cf6", link: "#b69cff" },
    Midnight: { bgLowest: "#0b0d13", bgLower: "#10131b", bgLow: "#141824", surface: "#1a1f2e", surfaceHigher: "#212739", text: "#e6e9f2", muted: "#8e96ad", accent: "#5b8cff", link: "#7aa2ff" },
    Rose: { bgLowest: "#140c10", bgLower: "#1c1116", bgLow: "#22151b", surface: "#2a1a22", surfaceHigher: "#33202a", text: "#f6e9ef", muted: "#b495a3", accent: "#f0609e", link: "#ff8fbf" },
    Forest: { bgLowest: "#0a110d", bgLower: "#0f1812", bgLow: "#131f17", surface: "#18271d", surfaceHigher: "#1e3024", text: "#e5f1e8", muted: "#8fac98", accent: "#3fbf7f", link: "#6ddba0" },
};

const PREVIEW_ID = "vanta-theme-editor-preview";

/** Resolves any CSS colour (incl. var()/color-mix) to #rrggbb using the browser. */
function toHex(cssColor: string) {
    const c = document.createElement("canvas").getContext("2d")!;
    const probe = document.createElement("div");
    probe.style.color = cssColor;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    c.fillStyle = "#000";
    c.fillStyle = resolved;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function fromCurrentDiscord(): Record<string, string> {
    const host = document.querySelector(".theme-dark, .theme-darker, .theme-midnight, .theme-light") ?? document.documentElement;
    const out: Record<string, string> = {};
    for (const f of COLORS) {
        const probe = document.createElement("span");
        host.append(probe);
        probe.style.color = `var(${f.vars[0]})`;
        out[f.key] = toHex(getComputedStyle(probe).color);
        probe.remove();
    }
    return out;
}

function buildCss(st: any) {
    const decl: string[] = [];
    for (const f of COLORS) if (st.colors[f.key]) for (const v of f.vars) decl.push(`    ${v}: ${st.colors[f.key]};`);
    decl.push(`    --mention-background: ${st.colors.accent}26;`, `    --text-brand: ${st.colors.link};`);
    if (st.font.trim()) decl.push(`    --font-primary: "${st.font.replace(/["\\;{}]/g, "")}", "gg sans", sans-serif;`);
    const r = Math.max(0, Math.min(24, Number(st.radius) || 0));
    if (st.radius !== "") decl.push(`    --radius-sm: ${Math.round(r * 0.66)}px;`, `    --radius-md: ${r}px;`, `    --radius-lg: ${Math.round(r * 1.33)}px;`);
    const clean = (s: string) => s.replace(/\*\//g, "").replace(/[\r\n]/g, " ").trim();
    return `/**
 * @name ${clean(st.name) || "My Theme"}
 * @author ${clean(st.author) || "Me"}
 * @version 1.0.0
 * @description Made with the Vanta theme editor.
 */

.theme-dark, .theme-darker, .theme-midnight,
.visual-refresh.theme-dark, .visual-refresh .theme-dark, .visual-refresh .theme-darker {
${decl.join("\n")}
}
`;
}

export function editorTab(ctx: PageContext) {
    const st = (ctx.state.editor ??= { name: "My Theme", author: "", font: "", radius: "", colors: { ...PRESETS.Vantablack } });
    const preview = () => {
        let el = document.getElementById(PREVIEW_ID) as HTMLStyleElement | null;
        if (!el) { el = Object.assign(document.createElement("style"), { id: PREVIEW_ID }); }
        document.head.append(el); // last, so it wins over the active theme
        el.textContent = buildCss(st);
    };
    ctx.onDispose(() => document.getElementById(PREVIEW_ID)?.remove()); // preview only while editing
    preview();

    const text = (label: string, key: "name" | "author" | "font" | "radius", placeholder = "", type = "text") => {
        const input = h("input", { class: "vanta-input", type, value: st[key], placeholder, "aria-label": label, style: { width: "220px" } });
        input.addEventListener("input", () => { st[key] = input.value; preview(); });
        return ui.row({ title: label, control: input });
    };

    const colorRows = COLORS.map(f => {
        const picker = h("input", { type: "color", value: st.colors[f.key], "aria-label": f.label, style: { width: "44px", height: "32px", border: "0", background: "none", cursor: "pointer" } });
        const hex = h("input", { class: "vanta-input vanta-code", value: st.colors[f.key], "aria-label": f.label + " (hex)", style: { width: "100px" } });
        picker.addEventListener("input", () => { st.colors[f.key] = picker.value; hex.value = picker.value; preview(); });
        hex.addEventListener("change", () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { st.colors[f.key] = hex.value; picker.value = hex.value; preview(); } else hex.value = st.colors[f.key]; });
        return ui.row({ title: f.label, control: h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, picker, hex) });
    });

    const presetSelect = h("select", { class: "vanta-input", style: { width: "auto" }, "aria-label": "Start from" },
        h("option", { value: "" }, "Start from…"),
        h("option", { value: "__current" }, "Discord's current colours"),
        Object.keys(PRESETS).map(n => h("option", { value: n }, n)));
    presetSelect.addEventListener("change", () => {
        const v = presetSelect.value;
        if (!v) return;
        st.colors = v === "__current" ? fromCurrentDiscord() : { ...PRESETS[v] };
        ctx.rerender();
    });

    const fileName = () => (st.name.trim() || "My Theme").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".theme.css";

    return ui.section(null,
        ui.note("", "Changes preview live on Discord while you're on this tab. Save to keep them as a theme."),
        h("div", { class: "vanta-toolbar" }, presetSelect,
            ui.button("Save as theme", { variant: "primary", icon: "check", onClick: async () => {
                try {
                    const file = fileName();
                    await native.writeTheme(file, buildCss(st));
                    themes.refreshLocal();
                    themes.setEnabled(file, true);
                    ui.toast(`Saved and applied ${file}`, { type: "ok" });
                } catch (e) { ui.toast("Couldn't save: " + cleanError(e), { type: "danger" }); }
            } }),
            ui.button("Copy CSS", { icon: "code", onClick: async () => { await copyText(buildCss(st)); ui.toast("Theme CSS copied", { type: "ok" }); } }),
        ),
        ui.section("Details", ui.card({ class: "vanta-rows" },
            text("Theme name", "name", "My Theme"), text("Your name", "author", "optional"),
            text("Font", "font", "e.g. Inter (empty = Discord's)"), text("Corner roundness (px)", "radius", "e.g. 8", "number"))),
        ui.section("Colours", ui.card({ class: "vanta-rows" }, colorRows)),
    );
}
