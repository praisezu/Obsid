import type { UpdateCheck, UpdaterInfo } from "@shared/types";
import { native, cleanError } from "../core/native";
import { ui, h, type Child } from "../ui/components";
import { checkForUpdates } from "../autoUpdate";

interface State {
    info?: UpdaterInfo;
    check?: UpdateCheck;
    checking?: boolean;
    applied?: string;
    error?: string | null;
}

ui.registerPage({
    id: "updater",
    label: "Updater",
    icon: "updater",
    order: 4,
    keywords: ["update", "version", "release"],
    render(ctx) {
        const st = ctx.state as State;
        const body = h("div", { style: { display: "contents" } });
        const root = h("div", { class: "vanta-page" }, ui.pageHead("Updater", "Keep Vanta up to date."), body);

        const draw = () => {
            if (!root.isConnected && body.childElementCount) return;
            const info = st.check ?? st.info;
            if (!info) { body.replaceChildren(ui.empty("Checking your Vanta install…", "updater")); return; }
            const parts: Child[] = [];

            parts.push(ui.card({ class: "vanta-pad" }, h("dl", { class: "vanta-kv" },
                h("dt", {}, "Version"), h("dd", {}, info.version),
                h("dt", {}, "Installed at"), h("dd", { class: "vanta-code" }, info.root),
                h("dt", {}, "Updates from"), h("dd", {}, info.mode === "release"
                    ? `GitHub releases (${info.repo})`
                    : h("span", { class: "vanta-code" }, info.remote || "git (no remote)")),
                info.mode === "git" ? [h("dt", {}, "Branch"), h("dd", {}, info.branch || "?"), h("dt", {}, "Commit"), h("dd", { class: "vanta-code" }, info.commit || "?")] : null,
            )));

            if (info.mode === "git" && !info.gitInstalled) {
                parts.push(ui.note("warn", "Git isn't installed, so this dev copy can't update itself. Install Git for Windows, or reinstall Vanta with the installer."));
            } else if (info.mode === "git" && !info.upstream) {
                parts.push(ui.note("", "This is a git checkout without an upstream branch. Push it to GitHub (git push -u origin <branch>) to get updates here."));
            } else {
                if (info.mode === "git" && info.dirty) parts.push(ui.note("warn", "You have uncommitted changes. Updating only works if they don't conflict."));
                const c = st.check;
                const hasUpdate = !!(c && (c.updates.length || c.release));
                parts.push(h("div", { class: "vanta-btns" },
                    ui.button(st.checking ? "Checking…" : "Check for updates", { icon: "refresh", variant: hasUpdate ? "" : "primary", onClick: check }),
                    hasUpdate ? ui.button("Update now", { variant: "primary", icon: "download", onClick: apply }) : null,
                ));
                if (st.error) parts.push(ui.note("danger", st.error));
                if (c && !st.applied) {
                    if (c.release) {
                        parts.push(ui.section(`New release: ${c.release.name}`,
                            ui.card({ class: "vanta-pad", style: { whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: "20px" } }, c.release.notes || "No release notes."),
                            h("div", {}, ui.button("View on GitHub", { small: true, variant: "ghost", icon: "globe", onClick: () => native.openUrl(c.release!.url) }))));
                    } else if (c.updates.length) {
                        parts.push(ui.section(`${c.updates.length} new commit${c.updates.length > 1 ? "s" : ""}`,
                            h("div", { class: "vanta-list" }, c.updates.map(u => ui.card({ class: "vanta-commit" },
                                h("code", { class: "vanta-code" }, u.hash),
                                h("span", { style: { flex: "1", minWidth: "0" } }, u.message),
                                h("span", { class: "vanta-row-desc" }, `${u.author} · ${u.when}`))))));
                    } else if (!c.error) {
                        parts.push(ui.note("", "You're on the latest version."));
                    }
                }
                if (st.applied) parts.push(ui.note("", st.applied + " ",
                    ui.button("Restart Discord", { small: true, variant: "primary", icon: "power", onClick: () => native.relaunch() })));
            }

            parts.push(ui.section("Settings", ui.card({ class: "vanta-rows" },
                ui.settingRow("autoCheckUpdates", "Check for updates", "On startup and every 30 minutes."),
                ui.settingRow("autoUpdate", "Install updates automatically", "Installs it, refreshes Discord (or restarts it if needed), then tells you what changed. Waits until you're out of a voice call."))));
            body.replaceChildren(...(parts.flat(Infinity as 1) as Node[]));
        };

        async function check() {
            st.checking = true; st.error = null; draw();
            try { st.check = await native.updaterCheck(); if (st.check.error) st.error = st.check.error; }
            catch (e) { st.error = cleanError(e); }
            st.checking = false;
            draw();
        }

        // Same flow as the automatic updater: install, restart Discord, then show the new version.
        async function apply() {
            await checkForUpdates({ manual: true });
            st.check = undefined;
            st.info = await native.updaterInfo().catch(() => st.info);
            draw();
        }

        draw();
        if (!st.info) native.updaterInfo().then(i => { st.info = i; draw(); }, e => { st.error = cleanError(e); draw(); });
        return root;
    },
});
