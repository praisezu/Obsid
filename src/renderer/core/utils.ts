export function onDomReady(fn: () => void) {
    if (document.readyState !== "loading" && document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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
