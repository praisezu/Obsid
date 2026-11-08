import { native } from "./native";
import { settings } from "./settings";
import { onDomReady } from "./utils";

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const quickCss = {
    el: null as HTMLStyleElement | null,
    css: native.getQuickCss() || "",
    get enabled() { return settings.themes.quickCssEnabled !== false; },

    /** Writes the current CSS into the page (or clears it while Quick CSS is switched off). */
    apply() {
        onDomReady(() => {
            if (!this.el) {
                this.el = document.createElement("style");
                this.el.id = "obsid-quickcss";
                document.head.append(this.el);
            }
            const css = this.enabled ? this.css : "";
            if (this.el.textContent !== css) this.el.textContent = css;
        });
    },
    save(css: string) {
        this.css = css;
        this.apply();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => native.setQuickCss(css), 300);
    },
};

native.onQuickCssChange(css => {
    quickCss.css = css;
    quickCss.apply();
    window.dispatchEvent(new CustomEvent("obsid:quickcss"));
});
