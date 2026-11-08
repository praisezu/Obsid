/** Helpers for working with messages rendered in chat. */
import { common } from "./common";

/** Message list items have id="chat-messages-<channelId>-<messageId>". */
export function messageIdsFromElement(el: Element | null): { channelId: string; messageId: string } | null {
    const li = el?.closest?.('[id^="chat-messages-"]');
    const m = li?.id.match(/^chat-messages-(\d+)-(\d+)$/);
    return m ? { channelId: m[1], messageId: m[2] } : null;
}

/** The Discord message object behind a chat element, if it's loaded. */
export function messageFromElement(el: Element | null): any | null {
    const ids = messageIdsFromElement(el);
    return ids ? common.MessageStore?.getMessage?.(ids.channelId, ids.messageId) ?? null : null;
}

export function messageLink(channelId: string, messageId: string) {
    const guildId = common.ChannelStore?.getChannel?.(channelId)?.guild_id ?? "@me";
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
        // Fallback for when the clipboard API is blocked
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    }
}

/** Matches the API endpoints used when you send or edit a message. */
export const SEND_URL = /\/channels\/(\d+)\/messages$/;
export const SEND_OR_EDIT_URL = /\/channels\/(\d+)\/messages(\/\d+)?$/;
