/*
 * Keeps Discord's minimize / maximize / close buttons working whatever theme is on.
 *
 * Windows decides where a click "drags the window" from CSS `-webkit-app-region` before the page
 * sees the click. Themes that stretch or move the title bar's drag area (or shift the layout under
 * it) can leave the drag area on top of the buttons, so clicking them does nothing. Electron lets
 * later regions in the page win, so we keep a no-drag box over each button as the very last thing
 * on the page, and CSS that stops themes hiding the buttons or switching their clicks off.
 */
import { onDomReady, every } from "./core/utils";

const CSS = `[class*="winButtons_"], [class*="winButton_"] {
  -webkit-app-region: no-drag !important; app-region: no-drag !important;
  pointer-events: auto !important; visibility: visible !important; opacity: 1 !important; }
[class*="winButtons_"] { position: relative !important; z-index: 2147483646 !important; }
#vanta-window-controls { position: fixed; inset: 0 auto auto 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647; }
#vanta-window-controls > i { position: fixed; display: block; pointer-events: none; -webkit-app-region: no-drag; app-region: no-drag; }`;

export function startWindowControls() {
    if (navigator.platform.startsWith("Mac")) return; // macOS uses its own traffic lights
    onDomReady(() => {
        const style = Object.assign(document.createElement("style"), { id: "vanta-window-controls-css", textContent: CSS });
        const holder = Object.assign(document.createElement("div"), { id: "vanta-window-controls" });
        holder.setAttribute("aria-hidden", "true");
        let last = "";
        const sync = () => {
            // Stay at the end of <body>: after themes' styles, and after any element that marks itself as drag
            if (style.parentNode !== document.body || holder.nextElementSibling !== style || style.nextElementSibling)
                document.body.append(holder, style);
            const rects = [...document.querySelectorAll<HTMLElement>('[class*="winButton_"][aria-label]')]
                .map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
            const key = rects.map(r => `${r.left},${r.top},${r.width},${r.height}`).join("|");
            if (key === last) return;
            last = key;
            holder.replaceChildren(...rects.map(r => {
                const i = document.createElement("i");
                Object.assign(i.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
                return i;
            }));
        };
        sync();
        every(sync, 1000);
        window.addEventListener("resize", () => requestAnimationFrame(sync));
    });
}
