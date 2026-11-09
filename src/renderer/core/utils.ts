import { health } from "./health";

export function onDomReady(fn: () => void) {
    if (document.readyState !== "loading" && document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Like setInterval, but skips the work while Discord is minimized or hidden, so polling plugins
 * cost nothing in the background. Stop it with clearInterval().
 */
export function every(fn: () => void, ms: number) {
    const owner = health.current;
    return setInterval(() => { if (!document.hidden) try { health.track(owner, fn); } catch { } }, ms);
}

/** A <style> element owned by a plugin. Call .set(css) to update and .remove() on stop. */
export function managedStyle(id: string) {
    let el: HTMLStyleElement | null = null;
    return {
        set(css: string) {
            onDomReady(() => {
                el ??= document.head.appendChild(Object.assign(document.createElement("style"), { id }));
                if (el.textContent !== css) el.textContent = css;
            });
        },
        remove() { el?.remove(); el = null; },
    };
}

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
