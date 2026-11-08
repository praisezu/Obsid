// Turns shortcuts into Discord timestamps, which show in every reader's own time zone.
import { definePlugin, net } from "@api";

export default definePlugin({
    name: "TimestampShortcuts",
    description: "Type {now}, {in 2h}, {at 9pm} or {tomorrow 18:00} and it becomes a timestamp everyone sees in their own time zone.",
    authors: ["Obsid"],
    category: "Chat",

    STYLES: { t: "t", T: "T", d: "d", D: "D", f: "f", F: "F", R: "R" },

    /** Returns [date, defaultStyle] or null. */
    parse(expr: string): [Date, string] | null {
        const s = expr.trim().toLowerCase();
        const now = new Date();
        if (s === "now") return [now, "f"];
        let m = s.match(/^in\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/);
        if (m) {
            const n = parseFloat(m[1]);
            const unit = m[2][0];
            const ms = ({ s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 } as Record<string, number>)[unit];
            if (!ms) return null;
            return [new Date(now.getTime() + n * ms), "R"];
        }
        m = s.match(/^(today|tomorrow|at)?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
        if (m && (m[1] || m[3] || m[4])) {
            let hour = parseInt(m[2], 10);
            const min = parseInt(m[3] || "0", 10);
            if (m[4] === "pm" && hour < 12) hour += 12;
            if (m[4] === "am" && hour === 12) hour = 0;
            if (hour > 23 || min > 59) return null;
            const d = new Date(now);
            d.setHours(hour, min, 0, 0);
            if (m[1] === "tomorrow" || (m[1] !== "today" && d < now)) d.setDate(d.getDate() + 1);
            return [d, "t"];
        }
        return null;
    },

    convert(text) {
        // {expr} or {expr:STYLE}
        return text.replace(/\{([^{}:\n]{2,30})(?::([tTdDfFR]))?\}/g, (whole, expr, style) => {
            const r = this.parse(expr);
            if (!r) return whole;
            return `<t:${Math.floor(r[0].getTime() / 1000)}:${style || r[1]}>`;
        });
    },

    start() {
        this.untransform = net.transform(({ method, url, body }) => {
            if (!/^(POST|PATCH)$/.test(method) || !/\/channels\/\d+\/messages(\/\d+)?$/.test(url)) return;
            const data = JSON.parse(body);
            if (typeof data.content !== "string" || !data.content.includes("{")) return;
            const out = this.convert(data.content);
            if (out === data.content) return;
            data.content = out;
            return JSON.stringify(data);
        });
    },
    stop() { this.untransform?.(); },
});
