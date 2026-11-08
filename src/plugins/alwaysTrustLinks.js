Obsid.definePlugin({
    name: "AlwaysTrustLinks",
    description: "Skips the \"Leaving Discord\" warning and opens links straight away. (English Discord only.)",
    authors: ["Obsid"],
    category: "Utility",

    tryConfirm(dialog) {
        const text = dialog.innerText || "";
        if (!/leaving discord/i.test(text)) return;
        const btn = [...dialog.querySelectorAll("button")].find(b => /^\s*visit site\s*$/i.test(b.innerText));
        btn?.click();
    },
    start() {
        Obsid.utils.onDomReady(() => {
            this.observer = new MutationObserver(muts => {
                for (const m of muts) for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    const dialog = n.matches?.('[role="dialog"]') ? n : n.querySelector?.('[role="dialog"]');
                    if (dialog) setTimeout(() => this.tryConfirm(dialog), 0);
                }
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        });
    },
    stop() { this.observer?.disconnect(); },
});
