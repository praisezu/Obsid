import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "AlwaysTrustLinks",
    description: "Skips the \"Leaving Discord\" warning and opens links straight away. (English Discord only.)",
    authors: ["Obsid"],
    category: "Utility",

    tryConfirm(dialog: HTMLElement) {
        const text = dialog.innerText || "";
        if (!/leaving discord/i.test(text)) return;
        const btn = [...dialog.querySelectorAll("button")].find(b => /^\s*visit site\s*$/i.test(b.innerText));
        btn?.click();
    },
    start() {
        onDomReady(() => {
            this.observer = new MutationObserver(muts => {
                for (const m of muts) for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    const el = n as Element;
                    const dialog = el.matches?.('[role="dialog"]') ? el : el.querySelector?.('[role="dialog"]');
                    if (dialog) setTimeout(() => this.tryConfirm(dialog as HTMLElement), 0);
                }
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        });
    },
    stop() { this.observer?.disconnect(); },
});
