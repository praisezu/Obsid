Obsid.definePlugin({
    name: "TextReplace",
    description: "Automatically replaces words or patterns in messages you send, using your own rules.",
    authors: ["Obsid"],
    category: "Chat",
    options: {
        rules: {
            type: "text", label: "Rules",
            default: "teh -> the\n:shrug: -> ¯\\\\_(ツ)_/¯",
            placeholder: "one rule per line:  find -> replace\n/regex/gi -> replacement",
            description: "One rule per line, written as  find -> replace. Wrap the left side in /slashes/flags to use a regex ($1 works in the replacement).",
        },
        skipCode: { type: "boolean", default: true, label: "Skip code", description: "Don't touch text inside `code` and ```code blocks```." },
    },

    parseRules() {
        const rules = [];
        for (const line of String(this.settings.rules || "").split("\n")) {
            const i = line.indexOf(" -> ");
            if (i < 1) continue;
            const find = line.slice(0, i), replace = line.slice(i + 4).replace(/\\n/g, "\n");
            const re = find.match(/^\/(.+)\/([a-z]*)$/);
            const literal = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            try {
                rules.push(re
                    ? [new RegExp(re[1], re[2].includes("g") ? re[2] : re[2] + "g"), replace]
                    // Plain words only match whole words ("teh" won't touch "tehran").
                    : [new RegExp(/^\w+$/.test(find) ? `\\b${literal}\\b` : literal, "g"), replace.replace(/\$/g, "$$$$")]);
            } catch (e) { this.logger.warn("Bad rule:", line, e.message); }
        }
        return rules;
    },

    apply(text) {
        const rules = this.parseRules();
        if (!rules.length) return text;
        const run = s => rules.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
        if (!this.settings.skipCode) return run(text);
        // Split out code spans/blocks and only replace in the rest.
        return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => i % 2 ? part : run(part)).join("");
    },

    start() {
        this.untransform = Obsid.net.transform(({ method, url, body }) => {
            if (!/^(POST|PATCH)$/.test(method) || !/\/channels\/\d+\/messages(\/\d+)?$/.test(url)) return;
            const data = JSON.parse(body);
            if (typeof data.content !== "string" || !data.content) return;
            const out = this.apply(data.content);
            if (out === data.content) return;
            data.content = out;
            return JSON.stringify(data);
        });
    },
    stop() { this.untransform?.(); },
});
