import { definePlugin, every, cssPlugin, common, webpack, onFlux, watchElements, managedStyle, messageFromElement, native, ui, h } from "@api";

const userName = (u: any) => u?.globalName || u?.global_name || u?.username || "Someone";

export default [
    definePlugin({
        name: "ShowMeYourName",
        description: "Shows people's @username next to their display name in chat, so you always know who's who.",
        authors: ["Vanta"], category: "Chat",
        needsWebpack: true,
        options: { mode: { type: "select", default: "after", label: "Show", options: [{ value: "after", label: "Display name  @username" }, { value: "only", label: "Only @username" }] } },
        start() {
            this.style = managedStyle("vanta-show-my-name");
            this.style.set(`.vanta-username { margin-left: 6px; font-size: .85em; font-weight: 500; color: var(--text-muted); }`);
            this.unwatch = watchElements('[id^="message-username-"]', el => {
                const msg = messageFromElement(el);
                const u = msg?.author;
                if (!u?.username || el.querySelector(".vanta-username")) return;
                const display = u.globalName || u.global_name;
                if (this.settings.mode === "only") {
                    const nameEl = el.querySelector('[class*="username_"]') as HTMLElement | null;
                    if (nameEl && display) nameEl.dataset.vantaOriginal = nameEl.textContent ?? "";
                    if (nameEl) nameEl.textContent = "@" + u.username;
                    return;
                }
                if (!display || display === u.username) return;
                el.append(Object.assign(document.createElement("span"), { className: "vanta-username", textContent: "@" + u.username }));
            });
        },
        stop() {
            this.unwatch?.();
            this.style?.remove();
            document.querySelectorAll(".vanta-username").forEach(e => e.remove());
            document.querySelectorAll<HTMLElement>("[data-vanta-original]").forEach(e => { e.textContent = e.dataset.vantaOriginal ?? e.textContent; delete e.dataset.vantaOriginal; });
        },
    }),

    definePlugin({
        name: "ChannelTypingIndicator",
        description: "Shows animated dots next to channels and DMs where someone is typing.",
        authors: ["Vanta"], category: "Chat",
        needsWebpack: true,
        update(channelId: string) {
            const Typing = this.Typing;
            const me = common.UserStore?.getCurrentUser?.()?.id;
            const typers = Object.keys(Typing?.getTypingUsers?.(channelId) || {}).filter(id => id !== me);
            for (const link of document.querySelectorAll<HTMLElement>(`a[href$="/${channelId}"]`)) {
                if (link.closest('[id^="chat-messages-"], [id^="message-content-"]')) continue; // links inside messages
                let dots = link.querySelector<HTMLElement>(".vanta-typing-dots");
                if (!typers.length) { dots?.remove(); continue; }
                if (!dots) {
                    dots = Object.assign(document.createElement("span"), { className: "vanta-typing-dots" });
                    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
                    link.append(dots);
                }
                dots.title = typers.map(id => userName(common.UserStore?.getUser?.(id))).join(", ") + (typers.length === 1 ? " is typing…" : " are typing…");
            }
        },
        start() {
            this.Typing = common.TypingStore;
            if (!this.Typing) throw new Error("Discord's typing store wasn't found");
            this.style = managedStyle("vanta-channel-typing");
            this.style.set(`.vanta-typing-dots { display: inline-flex; gap: 2px; margin-left: auto; padding-left: 6px; align-items: center; }
.vanta-typing-dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--interactive-normal, var(--text-muted)); animation: vanta-dot 1.2s infinite ease-in-out; }
.vanta-typing-dots i:nth-child(2) { animation-delay: .15s; } .vanta-typing-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes vanta-dot { 0%, 60%, 100% { opacity: .3; transform: none; } 30% { opacity: 1; transform: translateY(-2px); } }`);
            const timers = new Map<string, ReturnType<typeof setTimeout>>();
            const handle = ({ channelId }: any) => {
                if (!channelId) return;
                // run after Discord's store has processed the event
                setTimeout(() => this.update(channelId), 0);
                clearTimeout(timers.get(channelId));
                timers.set(channelId, setTimeout(() => this.update(channelId), 11000)); // typing expires after ~10s
            };
            this.offs = [onFlux("TYPING_START", handle), onFlux("TYPING_STOP", handle), onFlux("MESSAGE_CREATE", ({ channelId }) => handle({ channelId }))];
        },
        stop() { this.offs?.forEach((f: () => void) => f()); this.style?.remove(); document.querySelectorAll(".vanta-typing-dots").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "OnlineFriendsCount",
        description: "Shows how many friends are online next to \"Friends\" in your DM list.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        count() {
            const ids: string[] = common.RelationshipStore?.getFriendIDs?.() ?? [];
            return { online: ids.filter(id => (this.Presence?.getStatus?.(id) ?? "offline") !== "offline").length, total: ids.length };
        },
        render() {
            const link = document.querySelector<HTMLElement>('[class*="privateChannels_"] a[href="/channels/@me"]');
            if (!link) return;
            const { online } = this.count();
            let badge = link.querySelector<HTMLElement>(".vanta-online-count");
            if (!badge) { badge = Object.assign(document.createElement("span"), { className: "vanta-online-count" }); link.append(badge); }
            badge.textContent = `${online} online`;
        },
        start() {
            this.Presence = common.PresenceStore;
            this.style = managedStyle("vanta-online-count");
            this.style.set(`.vanta-online-count { margin-left: auto; padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--status-positive, #3ba55c); white-space: nowrap; }`);
            let t: ReturnType<typeof setTimeout> | undefined;
            const soon = () => { clearTimeout(t); t = setTimeout(() => this.render(), 1500); };
            this.offs = [onFlux("PRESENCE_UPDATES", soon), onFlux("RELATIONSHIP_ADD", soon), onFlux("RELATIONSHIP_REMOVE", soon)];
            this.timer = every(() => this.render(), 30000); // also catches the DM list being re-mounted
            this.render();
        },
        stop() { this.offs?.forEach((f: () => void) => f()); clearInterval(this.timer); this.style?.remove(); document.querySelectorAll(".vanta-online-count").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "Translate",
        description: "Hover a message and press Ctrl+Alt+T to translate it. The text is sent to Google Translate.",
        authors: ["Vanta"], category: "Chat",
        needsWebpack: true,
        options: { to: { type: "string", default: "en", label: "Translate into", placeholder: "en", description: "Language code: en, es, fr, de, ja, pt, ru…" } },
        async translate(text: string) {
            const to = String(this.settings.to || "en").trim().replace(/[^\w-]/g, "") || "en";
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
            const data = JSON.parse(await native.fetchText(url));
            return { text: (data[0] || []).map((p: any[]) => p[0]).join(""), from: String(data[2] || "?") };
        },
        start() {
            this.style = managedStyle("vanta-translate");
            this.style.set(`.vanta-translation { margin: 4px 0; padding: 6px 10px; border-radius: 6px; border-left: 2px solid #8b5cf6;
  background: color-mix(in srgb, #8b5cf6 8%, transparent); white-space: pre-wrap; overflow-wrap: anywhere; }
.vanta-translation small { display: block; margin-bottom: 2px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
.vanta-translation button { all: unset; cursor: pointer; margin-left: 6px; color: var(--text-link); font-size: 11px; text-transform: none; }`);
            this.onKey = async (e: KeyboardEvent) => {
                if (!(e.ctrlKey && e.altKey && e.code === "KeyT")) return;
                const hovered = [...document.querySelectorAll('[id^="chat-messages-"]:hover')].pop() as HTMLElement | undefined;
                const msg = hovered && messageFromElement(hovered);
                if (!hovered || !msg?.content) return;
                e.preventDefault(); e.stopImmediatePropagation();
                const content = hovered.querySelector('[id^="message-content-"]');
                hovered.querySelector(".vanta-translation")?.remove();
                try {
                    const r = await this.translate(msg.content);
                    const box = h("div", { class: "vanta-translation" },
                        h("small", {}, `Translated from ${r.from}`, h("button", { type: "button", onclick: () => box.remove() }, "dismiss")),
                        r.text);
                    content?.after(box);
                } catch (err: any) { ui.toast("Translation failed: " + String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), { type: "danger" }); }
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); this.style?.remove(); document.querySelectorAll(".vanta-translation").forEach(e => e.remove()); },
    }),

    definePlugin({
        name: "HoverReactKeys",
        description: "Hover a message and press 1, 2 or 3 to add one of your quick reactions. No clicking.",
        authors: ["Vanta"], category: "Chat",
        start() {
            this.onKey = (e: KeyboardEvent) => {
                if (e.ctrlKey || e.altKey || e.metaKey || !/^Digit[1-3]$/.test(e.code)) return;
                const a = document.activeElement as HTMLElement | null;
                if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return; // typing
                const hovered = [...document.querySelectorAll('[id^="chat-messages-"]:hover')].pop();
                const quick = hovered?.querySelectorAll<HTMLElement>('[aria-label="Message Actions"] [aria-label^="Click to react with"]');
                const btn = quick?.[Number(e.code.slice(5)) - 1];
                if (!btn) return;
                e.preventDefault(); e.stopImmediatePropagation();
                btn.click();
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),

    definePlugin({
        name: "CopyHoveredMessage",
        description: "Hover a message and press Ctrl+C (with nothing selected) to copy its text.",
        authors: ["Vanta"], category: "Utility",
        needsWebpack: true,
        start() {
            this.onKey = async (e: KeyboardEvent) => {
                if (!(e.ctrlKey && e.code === "KeyC") || e.shiftKey || e.altKey) return;
                if (window.getSelection()?.toString()) return; // normal copy
                const a = document.activeElement as HTMLElement | null;
                if (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
                const hovered = [...document.querySelectorAll('[id^="chat-messages-"]:hover')].pop();
                const text = hovered && messageFromElement(hovered)?.content;
                if (!text) return;
                e.preventDefault();
                try { await navigator.clipboard.writeText(text); ui.toast("Copied message", { type: "ok", ms: 1500 }); } catch { }
            };
            document.addEventListener("keydown", this.onKey, true);
        },
        stop() { document.removeEventListener("keydown", this.onKey, true); },
    }),

    cssPlugin({
        name: "HideAudioMenus",
        description: "Hides the little arrows next to Mute and Deafen in your user panel.",
        authors: ["Vanta"], category: "Appearance",
        css: `[aria-label="Input Options"], [aria-label="Output Options"] { display: none !important; }`,
    }),
    cssPlugin({
        name: "HideActiveNow",
        description: "Hides the \"Active Now\" column on the Friends page.",
        authors: ["Vanta"], category: "Appearance",
        css: `[class*="nowPlayingColumn_"] { display: none !important; }`,
    }),
];
