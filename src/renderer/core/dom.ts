/*
 * One shared MutationObserver for every plugin that reacts to new elements.
 * It only runs while at least one watcher exists, and batches work once per animation frame,
 * so ten plugins watching messages cost about the same as one.
 */
import { logger } from "./logger";
import { onDomReady } from "./utils";
import { health } from "./health";

interface Watcher {
    selector: string;
    cb: (el: HTMLElement) => void;
    seen: WeakSet<Element>;
    owner: string | null;
}

const watchers = new Set<Watcher>();
let observer: MutationObserver | null = null;
let pending: Node[] = [];
let scheduled = false;

function run(w: Watcher, el: Element) {
    if (w.seen.has(el)) return;
    w.seen.add(el);
    try { health.track(w.owner, () => w.cb(el as HTMLElement)); } catch (e) { logger.error(`Element watcher failed${w.owner ? " (" + w.owner + ")" : ""}`, e); }
}

function scan(w: Watcher, root: ParentNode) {
    if (root instanceof Element && root.matches(w.selector)) run(w, root);
    for (const el of root.querySelectorAll(w.selector)) run(w, el);
}

function flush() {
    scheduled = false;
    const nodes = new Set(pending); // the same node can be added more than once per frame
    pending = [];
    for (const node of nodes) {
        if (!(node instanceof Element) || !node.isConnected) continue;
        // Discord often adds a container and its children in one frame. Scanning the container
        // already covers the children, so skip any node inside another one in this batch.
        let covered = false;
        for (let p = node.parentNode; p; p = p.parentNode) if (nodes.has(p)) { covered = true; break; }
        if (covered) continue;
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
    const w: Watcher = { selector, cb, seen: new WeakSet(), owner: health.current };
    watchers.add(w);
    onDomReady(() => scan(w, document));
    ensureObserver();
    return () => {
        watchers.delete(w);
        if (!watchers.size && observer) { observer.disconnect(); observer = null; pending = []; }
    };
}
