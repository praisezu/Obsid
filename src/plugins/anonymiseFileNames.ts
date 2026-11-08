import { definePlugin, net } from "@api";

export default definePlugin({
    name: "AnonymiseFileNames",
    description: "Renames files you upload so their original names (like IMG_2041 or your-real-name.pdf) aren't shared.",
    authors: ["Vanta"],
    category: "Privacy",
    options: {
        style: {
            type: "select", default: "random", label: "New name",
            options: [
                { value: "random", label: "Random (k3f9a0qz.png)" },
                { value: "timestamp", label: "Timestamp (1731024000000.png)" },
                { value: "fixed", label: "Fixed (file.png)" },
            ],
        },
    },

    rename(name) {
        if (!name) return name;
        const spoiler = name.startsWith("SPOILER_") ? "SPOILER_" : ""; // keep Discord's spoiler marker
        const ext = (name.match(/\.[a-z0-9]{1,8}$/i) || [""])[0];
        const base = this.settings.style === "timestamp" ? String(Date.now())
            : this.settings.style === "fixed" ? "file"
                : Math.random().toString(36).slice(2, 10);
        return spoiler + base + ext;
    },

    start() {
        const names = new Map(); // original → renamed, so the upload and the message agree
        const renamed = n => { if (!names.has(n)) names.set(n, this.rename(n)); return names.get(n); };

        this.untransform = net.transform(({ method, url, body }) => {
            if (method !== "POST") return;
            const isUpload = /\/channels\/\d+\/attachments$/.test(url);
            const isMessage = /\/channels\/\d+\/messages$/.test(url);
            if (!isUpload && !isMessage) return;

            if (typeof body === "string") {
                const data = JSON.parse(body);
                const list = isUpload ? data.files : data.attachments;
                if (!Array.isArray(list) || !list.length) return;
                for (const f of list) if (f.filename) f.filename = renamed(f.filename);
                if (isMessage) setTimeout(() => names.clear(), 0);
                return JSON.stringify(data);
            }

            if (body instanceof FormData) {
                // Small uploads go straight into the message as multipart form data.
                const out = new FormData();
                let changed = false;
                for (const [key, value] of body.entries()) {
                    if (value instanceof File) {
                        out.append(key, new File([value], renamed(value.name), { type: value.type, lastModified: value.lastModified }));
                        changed = true;
                    } else if (key === "payload_json") {
                        try {
                            const p = JSON.parse(value);
                            for (const a of p.attachments || []) if (a.filename) a.filename = renamed(a.filename);
                            out.append(key, JSON.stringify(p));
                        } catch { out.append(key, value); }
                    } else out.append(key, value);
                }
                names.clear();
                return changed ? out : undefined;
            }
        }, { anyBody: true });
    },
    stop() { this.untransform?.(); },
});
