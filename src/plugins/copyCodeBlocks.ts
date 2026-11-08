import { definePlugin, onDomReady } from "@api";

export default definePlugin({
    name: "CopyCodeBlocks",
    description: "Adds a Copy button to code blocks in messages.",
    authors: ["Obsid"],
    category: "Utility",

    CSS: `
.obsid-codewrap { position: relative; }
.obsid-copy-code { position: absolute; top: 6px; right: 6px; z-index: 1; opacity: 0; transition: opacity .12s;
  border: 1px solid var(--border-normal, rgba(150,150,160,.25)); border-radius: 6px; cursor: pointer;
  background: var(--background-surface-higher, #2b2b31); color: var(--text-default, #ddd);
  font: 600 12px var(--font-primary, sans-serif); padding: 4px 8px; }
.obsid-codewrap:hover .obsid-copy-code, .obsid-copy-code:focus-visible { opacity: 1; }
.obsid-copy-code:focus-visible { outline: 2px solid #8b5cf6; }`,

    enhance(pre) {
        if (pre.dataset.obsidCopy) return;
        pre.dataset.obsidCopy = "1";
        pre.classList.add("obsid-codewrap");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "obsid-copy-code";
        btn.textContent = "Copy";
        btn.setAttribute("aria-label", "Copy code");
        btn.addEventListener("click", async e => {
            e.stopPropagation();
            const code = pre.querySelector("code")?.innerText ?? pre.innerText;
            try { await navigator.clipboard.writeText(code.replace(/\n$/, "")); btn.textContent = "Copied!"; }
            catch { btn.textContent = "Failed"; }
            setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        });
        pre.append(btn);
    },
    scan(root = document) {
        for (const pre of root.querySelectorAll('[id^="message-content-"] pre')) this.enhance(pre);
    },

    start() {
        onDomReady(() => {
            this.style = document.head.appendChild(Object.assign(document.createElement("style"), { textContent: this.CSS }));
            this.scan();
            let queued = false;
            this.observer = new MutationObserver(() => {
                if (queued) return;
                queued = true;
                requestAnimationFrame(() => { queued = false; this.scan(); });
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        });
    },
    stop() {
        this.observer?.disconnect();
        this.style?.remove();
        for (const b of document.querySelectorAll(".obsid-copy-code")) b.remove();
        for (const p of document.querySelectorAll<HTMLElement>("[data-obsid-copy]")) { p.classList.remove("obsid-codewrap"); delete p.dataset.obsidCopy; }
    },
});
