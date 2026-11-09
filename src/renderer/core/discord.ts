/*
 * Small helpers on top of Discord's own internals: its API client (signed in as you, with Discord's own rate-limit
 * handling), its in-app navigation, and opening DMs / sending messages.
 */
import { find, findByCode } from "./webpack";
import { common } from "./common";

let rest: any, nav: any;
/**
 * Discord's own API client (signed in as you). Careful: a generic web-request library also has get/post/put/patch/del;
 * it has Request/getXHR too, and using it by mistake sends requests to the website instead of the API.
 */
const api = () => (rest ??= find(m => typeof m?.get === "function" && typeof m?.post === "function" && typeof m?.patch === "function"
    && typeof m?.del === "function" && !("Request" in m) && !("getXHR" in m)));
const router = () => (nav ??= findByCode("transitionTo -"));

export const discord = {
    /** Discord's API client: discord.api().get({ url, query }) → { body } */
    api,
    /** Goes to a path inside Discord, like /channels/@me/123 or /channels/guild/channel/message */
    go(path: string) {
        const t = router();
        if (typeof t === "function") return t(path);
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
    },
    jumpTo(channelId: string, messageId?: string) {
        const guild = common.ChannelStore?.getChannel?.(channelId)?.guild_id ?? "@me";
        discord.go(`/channels/${guild}/${channelId}${messageId ? "/" + messageId : ""}`);
    },
    /** The DM channel with a user, opening one if needed */
    async dmChannel(userId: string): Promise<string> {
        const existing = common.ChannelStore?.getDMFromUserId?.(userId);
        if (existing) return existing;
        const res = await api().post({ url: "/users/@me/channels", body: { recipients: [userId] } });
        return res.body.id;
    },
    /** Sends a plain text message as you */
    async send(channelId: string, content: string) {
        const nonce = String(BigInt(Date.now() - 1420070400000) << 22n);
        const res = await api().post({ url: `/channels/${channelId}/messages`, body: { content, nonce, tts: false, flags: 0 } });
        if (!res?.body?.id) throw new Error("Discord didn't confirm the message");
        return res.body;
    },
};
