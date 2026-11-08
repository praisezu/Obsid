// v0.5.1 plugins: QuickReply, VoiceNarrator, LastSeen, ConsoleJanitor, PasteLinks, RevealAllSpoilers, BetterUploadButton
import { definePlugin, common, webpack, onFlux, storage, ui, h, managedStyle, isPluginEnabled } from "@api";

const displayName = (u: any) => u?.globalName || u?.global_name || u?.username || "Someone";

function ago(ts: number) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const hr = Math.round(m / 60); if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
    const d = Math.round(hr / 24); return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Inside Discord's message box, or another place where typing must not be hijacked. */
const isOtherInput = (el: Element | null) =>
    !!el && (el.matches("input, textarea, select") || (!!(el as HTMLElement).isContentEditable && !el.closest('[role="textbox"]')));

export default [
    definePlugin({
        name: "QuickReply",
        description: "Ctrl+Up and Ctrl+Down pick a message to reply to, without touching the mouse. Ctrl+Down past the newest message cancels the reply.",
        authors: ["Vanta"], category: "Chat", since: "0.5.1",
        needsWebpack: true,
        messages(channelId: string): any[] {
            const list = common.MessageStore?.getMessages?.(channelId);
            const arr: any[] = list?._array ?? list?.toArray?.() ?? [];
            return arr.filter(m => m && (m.type === 0 || m.type === 19) && !m.deleted).reverse(); // newest first
        },
        start() {
            if (!common.MessageStore || !common.FluxDispatcher) throw new Error("Discord's message store wasn't found");
            this.index = -1; this.channel = null;
            this.style = managedStyle("vanta-quick-reply");
            this.style.set(`.vanta-qr-flash { animation: vanta-qr .9s ease-out; } @keyframes vanta-qr { from { background: color-mix(in srgb, #a98bff 22%, transparent); } }`);
            this.onKey = (e: KeyboardEvent) => {
                if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                if (isOtherInput(document.activeElement)) return;
                const channelId = common.SelectedChannelStore?.getChannelId?.();
                const channel = channelId && common.ChannelStore?.getChannel?.(channelId);
                if (!channel) return;
                if (this.channel !== channelId) { this.channel = channelId; this.index = -1; }
                const msgs = this.messages(channelId);
                if (!msgs.length) return;
                e.preventDefault(); e.stopImmediatePropagation();
                this.index = Math.max(-1, Math.min(msgs.length - 1, this.index + (e.key === "ArrowUp" ? 1 : -1)));
                if (this.index < 0) { common.FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId }); return; }
                const message = msgs[this.index];
                const isDM = channel.type === 1 || channel.type === 3;
                common.FluxDispatcher.dispatch({
                    type: "CREATE_PENDING_REPLY", channel, message,
                    shouldMention: !isPluginEnabled("NoReplyMention") && !isDM,
                    showMentionToggle: !isDM,
                });
                const el = document.getElementById(`chat-messages-${channelId}-${message.id}`);
                if (el) {
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                    el.classList.remove("vanta-qr-flash"); void el.offsetWidth; el.classList.add("vanta-qr-flash");
                }
            };
            // A reply that's sent or cancelled starts the count over
            this.offs = [
                onFlux("DELETE_PENDING_REPLY", () => { this.index = -1; }),
                onFlux("CHANNEL_SELECT", () => { this.index = -1; this.channel = null; }),
            ];
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() {
            document.removeEventListener("keydown", this.onKey, true);
            this.offs?.forEach((f: () => void) => f());
            this.style?.remove();
        },
    }),

    definePlugin({
        name: "VoiceNarrator",
        description: "Reads out who joins and leaves your voice channel, using your computer's text-to-speech voice.",
        authors: ["Vanta"], category: "Utility", since: "0.5.1",
        needsWebpack: true,
        options: {
            volume: { type: "number", default: 0.8, label: "Volume", description: "0 to 1" },
            rate: { type: "number", default: 1.1, label: "Speed", description: "0.5 to 2" },
            moves: { type: "boolean", default: true, label: "Say when you join a channel" },
        },
        say(text: string) {
            const u = new SpeechSynthesisUtterance(text);
            u.volume = Math.max(0, Math.min(1, Number(this.settings.volume) || 0.8));
            u.rate = Math.max(0.5, Math.min(2, Number(this.settings.rate) || 1.1));
            speechSynthesis.speak(u);
        },
        members(channelId: string | null): Set<string> {
            if (!channelId) return new Set();
            return new Set(Object.keys(this.Voice?.getVoiceStatesForChannel?.(channelId) ?? {}));
        },
        check() {
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const channelId = common.SelectedChannelStore?.getVoiceChannelId?.() ?? null;
            const now = this.members(channelId);
            if (channelId !== this.channelId) {
                if (channelId && this.settings.moves) {
                    const name = common.ChannelStore?.getChannel?.(channelId)?.name;
                    this.say(name ? `Connected to ${name}` : "Connected");
                }
                this.channelId = channelId; this.inChannel = now;
                return;
            }
            for (const id of now) if (!this.inChannel.has(id) && id !== me) this.say(`${displayName(common.UserStore?.getUser?.(id))} joined`);
            for (const id of this.inChannel) if (!now.has(id) && id !== me) this.say(`${displayName(common.UserStore?.getUser?.(id))} left`);
            this.inChannel = now;
        },
        start() {
            if (!("speechSynthesis" in window)) throw new Error("Text-to-speech isn't available");
            this.Voice = webpack.findStore("VoiceStateStore");
            if (!this.Voice) throw new Error("Discord's voice store wasn't found");
            this.channelId = common.SelectedChannelStore?.getVoiceChannelId?.() ?? null;
            this.inChannel = this.members(this.channelId);
            // Run after Discord's stores have handled the update
            const later = () => setTimeout(() => this.check(), 0);
            this.offs = [onFlux("VOICE_STATE_UPDATES", later), onFlux("VOICE_CHANNEL_SELECT", later)];
        },
        stop() { this.offs?.forEach((f: () => void) => f()); speechSynthesis.cancel(); },
    }),

    definePlugin({
        name: "LastSeen",
        description: "Remembers when each friend was last online. Open this plugin's settings to see the list.",
        authors: ["Vanta"], category: "Utility", since: "0.5.1",
        needsWebpack: true,
        seen: {} as Record<string, number>,
        mark(id: string) {
            this.seen[id] = Date.now();
            storage.set("LastSeen", this.seen, 5000);
        },
        async start() {
            if (!common.RelationshipStore || !common.PresenceStore) throw new Error("Discord's friend list wasn't found");
            this.seen = (await storage.get<Record<string, number>>("LastSeen")) ?? {};
            const friends = () => new Set<string>(common.RelationshipStore.getFriendIDs?.() ?? []);
            // Everyone online right now counts as seen now
            for (const id of friends()) if ((common.PresenceStore.getStatus?.(id) ?? "offline") !== "offline") this.seen[id] = Date.now();
            storage.set("LastSeen", this.seen, 5000);
            this.off = onFlux("PRESENCE_UPDATES", ({ updates }: any) => {
                const f = friends();
                for (const u of updates ?? []) {
                    const id = u?.user?.id;
                    if (id && f.has(id)) this.mark(id); // going offline or coming online: both mean "seen now"
                }
            });
            // Refresh the online ones every few minutes so "last seen" is accurate when they drop off
            this.timer = setInterval(() => {
                for (const id of friends()) if ((common.PresenceStore.getStatus?.(id) ?? "offline") !== "offline") this.seen[id] = Date.now();
                storage.set("LastSeen", this.seen, 5000);
            }, 5 * 60_000);
        },
        stop() { this.off?.(); clearInterval(this.timer); },
        settingsPanel() {
            const ids: string[] = common.RelationshipStore?.getFriendIDs?.() ?? [];
            if (!ids.length) return ui.empty("Turn the plugin on, then check back here.", "info");
            const rows = ids.map(id => {
                const user = common.UserStore?.getUser?.(id);
                const online = (common.PresenceStore?.getStatus?.(id) ?? "offline") !== "offline";
                return { name: displayName(user), online, at: online ? Date.now() : this.seen[id] ?? 0 };
            }).sort((a, b) => Number(b.online) - Number(a.online) || b.at - a.at);
            return h("div", { style: { display: "grid", gap: "4px", maxHeight: "360px", overflowY: "auto" } },
                ...rows.map(r => h("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", padding: "6px 2px" } },
                    h("span", {}, r.name),
                    h("span", { style: { color: r.online ? "var(--status-positive, #3ba55c)" : "var(--text-muted)" } },
                        r.online ? "Online now" : r.at ? ago(r.at) : "Not seen yet"))));
        },
    }),

    definePlugin({
        name: "ConsoleJanitor",
        description: "Silences Discord's own console logging, so DevTools only shows what matters (errors and Vanta).",
        authors: ["Vanta"], category: "Developer", since: "0.5.1",
        options: { warnings: { type: "boolean", default: true, label: "Also hide Discord's warnings" } },
        start() {
            const noisy = (a: unknown[]) => {
                const first = a[0];
                if (typeof first !== "string") return false;
                if (first.includes("[Vanta")) return false;
                return /^%c\[|^\[[\w .:-]+\]/.test(first); // Discord's "[Module]" prefixed logs
            };
            this.orig = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
            for (const k of ["log", "info", "debug"] as const) {
                const o = this.orig[k];
                console[k] = (...a: unknown[]) => { if (!noisy(a)) o.apply(console, a); };
            }
            if (this.settings.warnings) {
                const o = this.orig.warn;
                console.warn = (...a: unknown[]) => { if (!noisy(a)) o.apply(console, a); };
            }
        },
        stop() { if (this.orig) Object.assign(console, this.orig); this.orig = null; },
        onSettingChange() { if (this.started) { this.stop(); this.start(); } },
    }),

    definePlugin({
        name: "PasteLinks",
        description: "Select some text in the message box and paste a link: it becomes a clickable [text](link).",
        authors: ["Vanta"], category: "Chat", since: "0.5.1",
        start() {
            this.onPaste = (e: ClipboardEvent) => {
                const box = (e.target as Element | null)?.closest?.('[role="textbox"]');
                if (!box) return;
                const selected = window.getSelection()?.toString() ?? "";
                const url = e.clipboardData?.getData("text/plain").trim() ?? "";
                if (!selected.trim() || selected.includes("\n") || !/^https?:\/\/\S+$/i.test(url)) return;
                e.preventDefault(); e.stopImmediatePropagation();
                document.execCommand("insertText", false, `[${selected.replace(/[[\]]/g, "")}](${url})`);
            };
            document.addEventListener("paste", this.onPaste, true);
        },
        stop() { document.removeEventListener("paste", this.onPaste, true); },
    }),

    definePlugin({
        name: "RevealAllSpoilers",
        description: "Ctrl+click a spoiler to reveal every spoiler in the channel at once.",
        authors: ["Vanta"], category: "Chat", since: "0.5.1",
        start() {
            const SPOILER = '[class*="spoilerContent_"][class*="hidden_"], [class*="spoilerContainer_"][class*="hidden_"], [class*="spoilerContent_"][aria-expanded="false"]';
            this.onClick = (e: MouseEvent) => {
                if (!e.ctrlKey) return;
                const hit = (e.target as Element | null)?.closest?.('[class*="spoilerContent_"], [class*="spoilerContainer_"]');
                const chat = hit?.closest('[data-list-id="chat-messages"]') ?? hit?.closest("ol");
                if (!hit || !chat) return;
                e.preventDefault(); e.stopPropagation();
                for (const s of chat.querySelectorAll<HTMLElement>(SPOILER)) s.click();
                if (hit.matches(SPOILER)) (hit as HTMLElement).click();
            };
            document.addEventListener("click", this.onClick, true);
        },
        stop() { document.removeEventListener("click", this.onClick, true); },
    }),

    definePlugin({
        name: "BetterUploadButton",
        description: "Clicking the + button next to the message box opens the file picker straight away. Right-click it for the usual menu.",
        authors: ["Vanta"], category: "Chat", since: "0.5.1",
        start() {
            this.onClick = (e: MouseEvent) => {
                if (e.button !== 0) return;
                const btn = (e.target as Element | null)?.closest?.('[class*="attachWrapper_"] button, [class*="attachButton_"]');
                const form = btn?.closest("form");
                const input = form?.querySelector<HTMLInputElement>('input[type="file"]');
                if (!btn || !input) return;
                e.preventDefault(); e.stopImmediatePropagation();
                input.click();
            };
            this.onContext = (e: MouseEvent) => {
                const btn = (e.target as Element | null)?.closest?.('[class*="attachWrapper_"] button, [class*="attachButton_"]') as HTMLElement | null;
                if (!btn) return;
                e.preventDefault(); e.stopImmediatePropagation();
                document.removeEventListener("click", this.onClick, true);
                btn.click(); // the original menu
                document.addEventListener("click", this.onClick, true);
            };
            document.addEventListener("click", this.onClick, true);
            document.addEventListener("contextmenu", this.onContext, true);
        },
        stop() {
            document.removeEventListener("click", this.onClick, true);
            document.removeEventListener("contextmenu", this.onContext, true);
        },
    }),
];
