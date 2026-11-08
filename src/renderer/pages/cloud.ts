/* Cloud sync page: settings, Quick CSS, themes and imported plugins in a private GitHub Gist. */
import { native, cleanError } from "../core/native";
import { plugins } from "../core/plugins";
import { quickCss } from "../core/quickCss";
import { settings, saveSettings } from "../core/settings";
import { themes } from "../themes";
import { ui, h } from "../ui/components";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Vanta%20Sync";

async function snapshot() {
    const copy = JSON.parse(JSON.stringify(settings));
    if (copy.vanta) delete copy.vanta.pendingUpdate;
    const pluginFiles: Record<string, string> = {};
    for (const p of plugins.values()) if (p.file) pluginFiles[p.file] = await native.pluginRead(p.file);
    return {
        vantaSync: 1, version: native.info.version, created: new Date().toISOString(),
        settings: copy, quickCss: quickCss.css,
        themes: Object.fromEntries(themes.local.map(t => [t.file, t.css])),
        plugins: pluginFiles,
    };
}

export async function uploadNow() {
    const r = await native.cloudPush(await snapshot());
    return r.updated;
}

async function downloadAndApply() {
    const r = await native.cloudPull();
    if (!r) { ui.toast("There's nothing in the cloud yet. Upload from your other computer first."); return; }
    const d = r.data;
    if (d?.vantaSync !== 1) throw new Error("The cloud copy isn't a Vanta sync file");
    const ok = await ui.confirm({
        title: "Replace this computer's setup?",
        body: `Saved ${new Date(r.updated).toLocaleString()} with Vanta ${d.version}. This replaces your settings and Quick CSS, adds its themes and ${Object.keys(d.plugins ?? {}).length} imported plugin(s), then reloads Discord.`,
        confirmText: "Download & apply",
    });
    if (!ok) return;
    await native.backupApply({ vantaBackup: 1, version: d.version, created: d.created, settings: d.settings, quickCss: d.quickCss, themes: d.themes } as any, { settings: true, quickCss: true, themes: true });
    for (const [file, code] of Object.entries<string>(d.plugins ?? {})) await native.pluginInstall(file, code);
    location.reload();
}

// Automatic upload, a minute after things stop changing.
let autoTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("vanta:settings-saved", () => {
    if (!settings.vanta.cloudAuto) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => uploadNow().catch(() => { }), 60_000);
});

ui.registerPage({
    id: "cloud",
    label: "Cloud Sync",
    icon: "cloud",
    order: 5.5,
    keywords: ["sync", "gist", "github", "cloud"],
    render(ctx) {
        const body = h("div", { style: { display: "contents" } });
        const page = h("div", { class: "vanta-page" },
            ui.pageHead("Cloud Sync", "Keep your settings, plugins and themes the same on every computer, using a private GitHub Gist on your own account."),
            body);

        const draw = async () => {
            const s = await native.cloudStatus().catch(() => null);
            if (!s?.signedIn) {
                const input = h("input", { class: "vanta-input", type: "password", placeholder: "ghp_… or github_pat_…", "aria-label": "GitHub token", autocomplete: "off" });
                const err = h("div", { class: "vanta-row-desc", role: "alert", style: { color: "var(--o-danger)", minHeight: "18px" } });
                const signIn = async () => {
                    err.textContent = "";
                    try { const r = await native.cloudSignIn(input.value); input.value = ""; ui.toast(`Signed in as ${r.user}`, { type: "ok" }); draw(); }
                    catch (e) { err.textContent = cleanError(e); }
                };
                input.addEventListener("keydown", e => { if (e.key === "Enter") signIn(); });
                body.replaceChildren(
                    ui.card({ class: "vanta-pad", style: { display: "flex", flexDirection: "column", gap: "10px" } },
                        h("div", { class: "vanta-row-title" }, "1. Create a GitHub token"),
                        h("div", { class: "vanta-row-desc" }, "It only needs the \"gist\" permission, which is already ticked on the page that opens. Pick an expiry you're comfortable with."),
                        h("div", {}, ui.button("Open GitHub", { icon: "globe", onClick: () => native.openUrl(TOKEN_URL) })),
                        h("div", { class: "vanta-row-title", style: { marginTop: "6px" } }, "2. Paste it here"),
                        h("div", { class: "vanta-toolbar" }, h("div", { style: { flex: "1" } }, input), ui.button("Sign in", { variant: "primary", onClick: signIn })),
                        err),
                    ui.note("", "The token is encrypted with Windows' built-in protection and only used to read and write one private gist. Vanta never sends it anywhere else."),
                );
                return;
            }
            body.replaceChildren(
                ui.card({ class: "vanta-rows" },
                    ui.row({ title: `Signed in as ${s.user}`, description: s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleString()}` : "Not synced yet",
                        control: ui.button("Sign out", { small: true, variant: "ghost", onClick: async () => { await native.cloudSignOut(); draw(); } }) }),
                    ui.row({
                        title: "Sync automatically", description: "Upload a minute after you change something.",
                        control: ui.switch({ checked: !!settings.vanta.cloudAuto, label: "Sync automatically", onChange: v => { settings.vanta.cloudAuto = v; saveSettings(); } }),
                    }),
                ),
                h("div", { class: "vanta-btns" },
                    ui.button("Upload now", { variant: "primary", icon: "upload", onClick: async () => {
                        try { await uploadNow(); ui.toast("Uploaded to the cloud", { type: "ok" }); draw(); }
                        catch (e) { ui.toast(cleanError(e), { type: "danger", ms: 7000 }); }
                    } }),
                    ui.button("Download & apply", { icon: "download", onClick: async () => {
                        try { await downloadAndApply(); } catch (e) { ui.toast(cleanError(e), { type: "danger", ms: 7000 }); }
                    } }),
                    s.gistId ? ui.button("", { variant: "ghost", icon: "globe", title: "Open the gist on GitHub", onClick: () => native.openUrl(`https://gist.github.com/${s.gistId}`) }) : null,
                ),
                h("div", { class: "vanta-row-desc" }, "Synced: settings and plugin options, Quick CSS, your theme files and imported plugins. Not synced: your GitHub token."),
            );
        };
        body.replaceChildren(ui.empty("Loading…", "cloud"));
        draw();
        void ctx;
        return page;
    },
});
