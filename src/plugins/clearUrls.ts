import { definePlugin, net } from "@api";

export default definePlugin({
    name: "ClearURLs",
    description: "Strips tracking parameters (utm_*, fbclid, si, …) from links in messages you send.",
    authors: ["Vanta"],
    category: "Privacy",
    enabledByDefault: true,
    options: {
        extraParams: {
            type: "string",
            default: "",
            label: "Extra parameters",
            placeholder: "ref, source",
            description: "More link parameters to strip, separated by commas.",
        },
    },

    PARAMS: [
        /^utm_/i, /^fbclid$/, /^gclid$/, /^dclid$/, /^msclkid$/, /^mc_(eid|cid)$/, /^igshid$/, /^igsh$/,
        /^si$/, /^ref_src$/, /^ref_url$/, /^s$/, /^t$/, /^_hsenc$/, /^_hsmi$/, /^yclid$/, /^twclid$/,
        /^feature$/, /^pp$/, /^spm$/, /^share_id$/, /^__s$/,
    ],
    // Hosts where short params like "s"/"t"/"si"/"feature" are known to be trackers.
    SHORT_PARAM_HOSTS: /(^|\.)(twitter\.com|x\.com|youtube\.com|youtu\.be|spotify\.com|instagram\.com|tiktok\.com)$/i,

    clean(text) {
        return text.replace(/https?:\/\/[^\s<>()]+/g, raw => {
            let url;
            try { url = new URL(raw); } catch { return raw; }
            const shortOk = this.SHORT_PARAM_HOSTS.test(url.hostname);
            const extra = String(this.settings.extraParams || "").split(",").map(s => s.trim()).filter(Boolean);
            let changed = false;
            for (const key of [...new Set<string>(url.searchParams.keys())]) {
                let strip = extra.includes(key);
                if (!strip) {
                    const isShort = /^(s|t|si|feature|pp)$/.test(key);
                    if (isShort && !shortOk) continue;
                    if (key === "t" && /youtu/.test(url.hostname)) continue; // keep YouTube timestamps
                    strip = this.PARAMS.some(r => r.test(key));
                }
                if (strip) { url.searchParams.delete(key); changed = true; }
            }
            return changed ? url.toString() : raw;
        });
    },

    start() {
        this.untransform = net.transform(({ method, url, body }) => {
            if (!/^(POST|PATCH)$/.test(method) || !/\/channels\/\d+\/messages(\/\d+)?$/.test(url)) return;
            const data = JSON.parse(body);
            if (typeof data.content !== "string") return;
            const cleaned = this.clean(data.content);
            if (cleaned === data.content) return;
            data.content = cleaned;
            return JSON.stringify(data);
        });
    },
    stop() {
        this.untransform?.();
    },
});
