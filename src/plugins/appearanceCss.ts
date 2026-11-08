// Small appearance tweaks that are pure CSS (no runtime cost). One file, many plugins.
import { cssPlugin } from "@api";

const hide = (sel: string) => `${sel} { display: none !important; }`;
/** Hide an element and the list-item wrapper Discord puts around it. */
const hideWithWrapper = (sel: string, wrapper = '[class*="listItem_"]') => hide(`${wrapper}:has(${sel}), ${sel}`);

export default [
    cssPlugin({
        name: "AlwaysShowTimestamps",
        description: "Shows the time on every message in a group, not just when you hover.",
        authors: ["Vanta"], category: "Appearance",
        css: `[class*="timestampVisibleOnHover_"] { opacity: 1 !important; visibility: visible !important; color: var(--text-muted) !important; }`,
    }),
    cssPlugin({
        name: "HideGifTag",
        description: "Removes the little \"GIF\" label on GIFs in chat.",
        authors: ["Vanta"], category: "Appearance",
        css: hide('[class*="gifTag_"]'),
    }),
    cssPlugin({
        name: "HideStatuses",
        description: "Hides what people are playing and their custom statuses in the member and DM lists.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            activity: { type: "boolean", default: true, label: "Hide activity (Playing…, Listening to…)" },
            custom: { type: "boolean", default: true, label: "Hide custom statuses" },
        },
        css: s => [
            s.activity ? hide('[class*="members_"] [class*="activityStatusText_"], [class*="privateChannels_"] [class*="activityStatusText_"], [class*="members_"] [class*="subText_"]:has([class*="activityStatusText_"])') : "",
            s.custom ? hide('[class*="members_"] [class*="customStatusContent_"], [class*="privateChannels_"] [class*="customStatusContent_"]') : "",
        ].join("\n"),
    }),
    cssPlugin({
        name: "ServerListCleanup",
        description: "Hides the Add a Server and Discover buttons and the separator lines in the server list.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            add: { type: "boolean", default: true, label: "Hide \"Add a Server\"" },
            discover: { type: "boolean", default: true, label: "Hide \"Discover\"" },
            separators: { type: "boolean", default: false, label: "Hide separators" },
        },
        css: s => [
            s.add ? hideWithWrapper('[aria-label="Add a Server"]') : "",
            s.discover ? hideWithWrapper('[aria-label="Discover"]') : "",
            s.separators ? hide('[class*="guildSeparator_"]') : "",
        ].join("\n"),
    }),
    cssPlugin({
        name: "NoJumboEmoji",
        description: "Messages that are only emoji show them at normal size instead of huge.",
        authors: ["Vanta"], category: "Appearance",
        css: `[class*="emojiJumbo_"] { width: 1.375em !important; height: 1.375em !important; min-height: 0 !important; vertical-align: bottom; }`,
    }),
    cssPlugin({
        name: "HideStickers",
        description: "Hides stickers in chat (or blurs them until hovered).",
        authors: ["Vanta"], category: "Appearance",
        options: { mode: { type: "select", default: "hide", label: "Stickers", options: [{ value: "hide", label: "Hide" }, { value: "blur", label: "Blur until hovered" }] } },
        css: s => s.mode === "blur"
            ? `[class*="stickerAsset_"] { filter: blur(14px); transition: filter .2s; } [class*="stickerAsset_"]:hover { filter: none; }`
            : hide('[id^="message-accessories-"] [class*="stickerAsset_"], [id^="message-accessories-"] [class*="clickableSticker_"]'),
    }),
    cssPlugin({
        name: "HideLinkEmbeds",
        description: "Hides link previews (embeds) under messages. Images and videos you upload still show.",
        authors: ["Vanta"], category: "Appearance",
        css: hide('[id^="message-accessories-"] article[class*="embed_"]'),
    }),
    cssPlugin({
        name: "HideReplyPreviews",
        description: "Hides the quoted line above replies. You still see who replied, just less clutter.",
        authors: ["Vanta"], category: "Appearance",
        css: hide('[class*="repliedMessage_"]'),
    }),
    cssPlugin({
        name: "NoChatAvatars",
        description: "Removes avatars from chat for a compact, IRC-like look.",
        authors: ["Vanta"], category: "Appearance",
        css: `[id^="chat-messages-"] [class*="cozy_"] img[class*="avatar_"],
[id^="chat-messages-"] [class*="cozy_"] [class*="avatarDecoration_"] { display: none !important; }
[id^="chat-messages-"] [class*="cozy_"] { padding-left: 16px !important; }
[id^="chat-messages-"] [class*="cozy_"] [class*="timestampInline_"] { margin-left: 0; }`,
    }),
    cssPlugin({
        name: "TitleBarCleanup",
        description: "Hides the Help and Inbox buttons in the top bar.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            help: { type: "boolean", default: true, label: "Hide Help" },
            inbox: { type: "boolean", default: false, label: "Hide Inbox" },
        },
        css: s => [s.help ? hide('[aria-label="Help"]') : "", s.inbox ? hide('[aria-label="Inbox"]') : ""].join("\n"),
    }),
    cssPlugin({
        name: "ChannelHeaderCleanup",
        description: "Hides buttons you don't use in the channel header: calls, pins, invite.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            voice: { type: "boolean", default: false, label: "Hide \"Start Voice Call\"" },
            video: { type: "boolean", default: true, label: "Hide \"Start Video Call\"" },
            pins: { type: "boolean", default: false, label: "Hide \"Pinned Messages\"" },
            invite: { type: "boolean", default: true, label: "Hide \"Invite to Group DM\"" },
        },
        css: s => [
            ["voice", "Start Voice Call"], ["video", "Start Video Call"], ["pins", "Pinned Messages"], ["invite", "Invite to Group DM"],
        ].filter(([k]) => s[k]).map(([, l]) => hide(`[class*="toolbar_"] [aria-label="${l}"]`)).join("\n"),
    }),
    cssPlugin({
        name: "HoverBarCleanup",
        description: "Trims the buttons that appear when you hover a message.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            quickReactions: { type: "boolean", default: true, label: "Hide quick reactions" },
            forward: { type: "boolean", default: false, label: "Hide Forward" },
            react: { type: "boolean", default: false, label: "Hide Add Reaction" },
        },
        css: s => [
            s.quickReactions ? hide('[aria-label="Message Actions"] [aria-label^="Click to react with"], [aria-label="Message Actions"] [class*="separator_"]') : "",
            s.forward ? hide('[aria-label="Message Actions"] [aria-label="Forward"]') : "",
            s.react ? hide('[aria-label="Message Actions"] [aria-label="Add Reaction"]') : "",
        ].join("\n"),
    }),
    cssPlugin({
        name: "ThinScrollbars",
        description: "Slimmer scrollbars everywhere, or none at all.",
        authors: ["Vanta"], category: "Appearance",
        options: { mode: { type: "select", default: "thin", label: "Scrollbars", options: [{ value: "thin", label: "Thin" }, { value: "hidden", label: "Hidden" }] } },
        css: s => s.mode === "hidden"
            ? `::-webkit-scrollbar { width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }`
            : `::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
::-webkit-scrollbar-thumb { background: var(--background-mod-strong, rgba(150,150,160,.35)) !important; border: 0 !important; border-radius: 3px !important; min-height: 32px; }
::-webkit-scrollbar-track { background: transparent !important; border: 0 !important; }
* { scrollbar-width: thin; }`,
    }),
    cssPlugin({
        name: "ReduceMotion",
        description: "Turns off animations and transitions. Makes Discord feel snappier on slow PCs.",
        authors: ["Vanta"], category: "Appearance",
        css: `*, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; transition-delay: 0ms !important; scroll-behavior: auto !important; }`,
    }),
    cssPlugin({
        name: "MentionHighlight",
        description: "Pick your own colour for messages that mention you.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            color: { type: "string", default: "#8b5cf6", label: "Colour", placeholder: "#8b5cf6", description: "Any CSS colour: #hex, rgb(), a name." },
            strength: { type: "number", default: 14, label: "Background strength (%)" },
        },
        css: s => {
            const c = String(s.color || "#8b5cf6").replace(/[;{}<>]/g, "");
            const p = Math.max(0, Math.min(60, Number(s.strength) || 14));
            return `[class*="mentioned_"] { background: color-mix(in srgb, ${c} ${p}%, transparent) !important; }
[class*="mentioned_"]::before { background: ${c} !important; }`;
        },
    }),
    cssPlugin({
        name: "AccentColor",
        description: "Change Discord's blurple accent (buttons, links, toggles) to any colour.",
        authors: ["Vanta"], category: "Appearance",
        options: { color: { type: "string", default: "#8b5cf6", label: "Accent colour", placeholder: "#8b5cf6" } },
        css: s => {
            const c = String(s.color || "#8b5cf6").replace(/[;{}<>]/g, "");
            return `:root, .theme-dark, .theme-light, .theme-darker, .theme-midnight, .visual-refresh {
  --brand-500: ${c} !important; --brand-560: color-mix(in srgb, ${c} 88%, black) !important; --brand-600: color-mix(in srgb, ${c} 78%, black) !important;
  --button-filled-brand-background: ${c} !important; --button-filled-brand-background-hover: color-mix(in srgb, ${c} 88%, black) !important;
  --control-brand-foreground: color-mix(in srgb, ${c} 70%, white) !important; --control-brand-foreground-new: color-mix(in srgb, ${c} 70%, white) !important;
  --text-link: color-mix(in srgb, ${c} 65%, white) !important; }`;
        },
    }),
    cssPlugin({
        name: "ChatBackground",
        description: "Put an image behind your chat.",
        authors: ["Vanta"], category: "Appearance",
        options: {
            url: { type: "string", default: "", label: "Image link", placeholder: "https://…/wallpaper.jpg" },
            dim: { type: "number", default: 70, label: "Darken (%)", description: "Keeps text readable. 0 = no dimming." },
        },
        css: s => {
            const url = String(s.url || "").trim();
            if (!/^https:\/\/[^\s"'()]+$/i.test(url)) return "";
            const dim = Math.max(0, Math.min(95, Number(s.dim) || 0)) / 100;
            return `[class*="chatContent_"] { background: linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${url}") center / cover no-repeat fixed !important; }
[class*="chatContent_"] [class*="scroller_"], [class*="chatContent_"] form { background: transparent !important; }`;
        },
    }),
    cssPlugin({
        name: "HideTypingIndicator",
        description: "Hides \"someone is typing…\" under the message box.",
        authors: ["Vanta"], category: "Appearance",
        css: `form [class*="typing_"] { visibility: hidden !important; }`,
    }),
    cssPlugin({
        name: "HideReactions",
        description: "Hides reactions under messages.",
        authors: ["Vanta"], category: "Appearance",
        css: hide('[id^="message-reactions-"]'),
    }),
    cssPlugin({
        name: "GrayscaleMode",
        description: "Turns Discord black and white. Less distracting when you're trying to focus.",
        authors: ["Vanta"], category: "Appearance",
        options: { amount: { type: "number", default: 100, label: "Amount (%)" } },
        css: s => `#app-mount { filter: grayscale(${Math.max(0, Math.min(100, Number(s.amount) || 0))}%); }`,
    }),
    cssPlugin({
        name: "HideRoleIcons",
        description: "Hides the small role icons next to names.",
        authors: ["Vanta"], category: "Appearance",
        css: hide('[class*="roleIcon_"]'),
    }),
    cssPlugin({
        name: "MediaCorners",
        description: "Change how rounded images and videos in chat are.",
        authors: ["Vanta"], category: "Appearance",
        options: { radius: { type: "number", default: 0, label: "Corner radius (px)", description: "0 = square corners." } },
        css: s => {
            const r = Math.max(0, Math.min(40, Number(s.radius) || 0));
            return `[id^="message-accessories-"] :is([class*="imageWrapper_"], [class*="imageContainer_"], [class*="mosaicItem_"], video, img:not([class*="emoji"])) { border-radius: ${r}px !important; }`;
        },
    }),
];
