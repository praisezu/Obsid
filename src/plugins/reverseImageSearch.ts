import { definePlugin, native } from "@api";

export default definePlugin({
    name: "ReverseImageSearch",
    description: "Alt+Shift+click an image in chat to look it up with Google Lens, Bing, Yandex or TinEye.",
    authors: ["Vanta"],
    category: "Utility",
    options: {
        engine: {
            type: "select", default: "google", label: "Search engine",
            options: [
                { value: "google", label: "Google Lens" },
                { value: "bing", label: "Bing" },
                { value: "yandex", label: "Yandex" },
                { value: "tineye", label: "TinEye" },
            ],
        },
    },
    ENGINES: {
        google: u => "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(u),
        bing: u => "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:" + encodeURIComponent(u),
        yandex: u => "https://yandex.com/images/search?rpt=imageview&url=" + encodeURIComponent(u),
        tineye: u => "https://tineye.com/search?url=" + encodeURIComponent(u),
    },

    start() {
        this.onClick = e => {
            if (!(e.altKey && e.shiftKey) || e.button !== 0) return;
            const img = e.target.closest?.("img");
            if (!img?.src || !/^https:/.test(img.src)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const engine = this.ENGINES[this.settings.engine] || this.ENGINES.google;
            native.openUrl(engine(img.src));
        };
        document.addEventListener("click", this.onClick, true);
    },
    stop() { document.removeEventListener("click", this.onClick, true); },
});
