(() => {
    const { ui, native } = Obsid;
    const { h } = ui;

    const clean = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

    ui.registerPage({
        id: "updater",
        label: "Updater",
        icon: "updater",
        order: 4,
        render(ctx) {
            const st = ctx.state;
            const root = h("div", { class: "obsid-page" },
                ui.pageHead("Updater", "Keep Obsid up to date."));
            const body = h("div", { style: { display: "contents" } });
            root.append(body);

            const draw = () => {
                const info = st.info;
                if (!info) { body.replaceChildren(ui.empty("Checking your Obsid install…", "updater")); return; }

                const kv = h("dl", { class: "obsid-kv" },
                    h("dt", {}, "Version"), h("dd", {}, info.version),
                    h("dt", {}, "Installed at"), h("dd", { class: "obsid-code" }, info.root),
                    h("dt", {}, "Update source"), h("dd", { class: info.remote ? "obsid-code" : "" },
                        info.remote || (info.git ? "Git repo with no remote" : "None (local folder)")),
                    info.git ? [h("dt", {}, "Branch"), h("dd", {}, info.branch || "?")] : null,
                    info.git ? [h("dt", {}, "Current commit"), h("dd", { class: "obsid-code" }, info.commit || "?")] : null,
                );

                const parts = [ui.card({ class: "obsid-pad" }, kv)];

                if (!info.gitInstalled) {
                    parts.push(ui.note("warn", "Git isn't installed, so Obsid can't update itself. Install Git for Windows, then restart Discord."));
                } else if (!info.git || !info.upstream) {
                    parts.push(ui.note("",
                        h("div", { style: { fontWeight: "600", marginBottom: "4px" } }, "No update source set up yet"),
                        "Obsid updates itself with git. Put the Obsid folder in a GitHub repo, for example by running ",
                        h("code", {}, "git init"), ", ", h("code", {}, "git remote add origin <url>"), " and ",
                        h("code", {}, "git push -u origin main"), ". The Updater will then pull new commits for you."));
                } else {
                    if (info.dirty) parts.push(ui.note("warn", "You have uncommitted changes in the Obsid folder. Updating only works when they don't conflict."));
                    const actions = h("div", { class: "obsid-btns" },
                        ui.button(st.checking ? "Checking…" : "Check for updates", {
                            icon: "refresh", variant: st.updates?.length ? "" : "primary",
                            onClick: check,
                        }),
                        st.updates?.length ? ui.button(`Update now (${st.updates.length})`, { variant: "primary", icon: "download", onClick: update }) : null,
                    );
                    parts.push(actions);
                    if (st.error) parts.push(ui.note("danger", st.error));
                    if (st.updates) {
                        parts.push(st.updates.length
                            ? ui.section(`${st.updates.length} new commit${st.updates.length > 1 ? "s" : ""}`,
                                h("div", { class: "obsid-list" }, st.updates.map(c => ui.card({ class: "obsid-commit" },
                                    h("code", { class: "obsid-code" }, c.hash),
                                    h("span", { style: { flex: "1", minWidth: "0" } }, c.message),
                                    h("span", { class: "obsid-row-desc" }, `${c.author} · ${c.when}`)))))
                            : ui.note("", "You're on the latest version."));
                    }
                    if (st.pulled) parts.push(ui.note("",
                        "Updated! Restart Discord to load the new version. ",
                        ui.button("Restart Discord", { small: true, variant: "primary", icon: "power", onClick: () => native.relaunch() })));
                }

                parts.push(ui.section("Settings", ui.card({ class: "obsid-rows" },
                    ui.settingRow("autoCheckUpdates", "Check for updates on startup", "Shows a notification when new commits are available."))));
                body.replaceChildren(...parts);
            };

            async function check() {
                st.checking = true; st.error = null; draw();
                try { const r = await native.updaterCheck(); st.info = r; st.updates = r.updates; if (r.error) st.error = r.error; }
                catch (e) { st.error = clean(e); }
                st.checking = false;
                if (root.isConnected) draw();
            }

            async function update() {
                try {
                    const r = await native.updaterPull();
                    if (!r.ok) { st.error = "Update failed: " + r.output; }
                    else { st.pulled = true; st.updates = []; st.info = await native.updaterInfo(); }
                } catch (e) { st.error = clean(e); }
                if (root.isConnected) draw();
            }

            draw();
            if (!st.info) native.updaterInfo().then(i => { st.info = i; if (root.isConnected) draw(); }, e => { st.error = clean(e); st.info = { version: Obsid.version, root: native.info.root, gitInstalled: true }; draw(); });
            return root;
        },
    });

    /** Called from boot.js when "Check for updates on startup" is on. */
    Obsid.updater = {
        async startupCheck() {
            try {
                const r = await native.updaterCheck();
                if (r.updates?.length) Obsid.ui.toast(`Obsid update available (${r.updates.length} new). Open Settings › Updater.`);
            } catch { }
        },
    };
})();
