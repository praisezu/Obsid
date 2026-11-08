/*
 * One shared MutationObserver for every plugin that reacts to new elements.
 * It only runs while at least one watcher exists, and batches work once per animation frame,
 * so ten plugins watching messages cost about the same as one.
 */
import { logger } from "./logger";
import { onDomReady } from "./utils";

interface Watcher {
    selector: string;
    cb: (el: HTMLElement) => void;
    seen: WeakSet<Element>;
}

const watchers = new Set<Watcher>();
let observer: MutationObserver | null = null;
let pending: Node[] = [];
let scheduled = false;

function run(w: Watcher, el: Element) {
    if (w.seen.has(el)) return;
    w.seen.add(el);
    try { w.cb(el as HTMLElement); } catch (e) { logger.error("Element watcher failed", e); }
}

function scan(w: Watcher, root: ParentNode) {
    if (root instanceof Element && root.matches(w.selector)) run(w, root);
    for (const el of root.querySelectorAll(w.selector)) run(w, el);
}

function flush() {
    scheduled = false;
    const nodes = pending;
    pending = [];
    for (const node of nodes) {
        if (!(node instanceof Element) || !node.isConnected) continue;
        for (const w of watchers) scan(w, node);
    }
}

function ensureObserver() {
    if (observer || !watchers.size) return;
    onDomReady(() => {
        if (observer || !watchers.size) return;
        observer = new MutationObserver(muts => {
            for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) pending.push(n);
            if (!scheduled && pending.length) {
                scheduled = true;
                // rAF batches with rendering; the timeout covers a minimized/background window, where rAF is paused.
                const run = () => { if (scheduled) flush(); };
                requestAnimationFrame(run);
                setTimeout(run, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/**
 * Calls cb once for every element matching `selector`: those already on the page and every one
 * added later. Returns a function that stops watching.
 */
export function watchElements(selector: string, cb: (el: HTMLElement) => void) {
    const w: Watcher = { selector, cb, seen: new WeakSet() };
    watchers.add(w);
    onDomReady(() => scan(w, document));
    ensureObserver();
    return () => {
        watchers.delete(w);
        if (!watchers.size && observer) { observer.disconnect(); observer = null; pending = []; }
    };
}
