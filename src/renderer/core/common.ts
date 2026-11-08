/**
 * Discord modules that plugins use a lot, found lazily (each is undefined until Discord loads it).
 * Stores are found by their own name (store.getName()), which is far more reliable than matching
 * method names: several of Discord's stores share methods like getMessage().
 */
import { findByProps, findStore } from "./webpack";

export interface Common {
    FluxDispatcher: any;
    UserStore: any;
    ChannelStore: any;
    GuildStore: any;
    MessageStore: any;
    SelectedChannelStore: any;
    SelectedGuildStore: any;
    RelationshipStore: any;
    ReadStateStore: any;
    GuildChannelStore: any;
    TypingStore: any;
    PresenceStore: any;
}

const store = (name: string, ...fallbackProps: string[]) => () =>
    findStore(name) ?? (fallbackProps.length ? findByProps(...fallbackProps) : null);

const lookups: Record<keyof Common, () => any> = {
    FluxDispatcher: () => findByProps("dispatch", "subscribe", "unsubscribe", "_actionHandlers") ?? findByProps("dispatch", "subscribe", "unsubscribe"),
    UserStore: store("UserStore", "getCurrentUser", "getUser"),
    ChannelStore: store("ChannelStore", "getChannel", "getDMFromUserId"),
    GuildStore: store("GuildStore", "getGuild", "getGuilds"),
    MessageStore: store("MessageStore"),
    SelectedChannelStore: store("SelectedChannelStore", "getChannelId", "getLastSelectedChannelId"),
    SelectedGuildStore: store("SelectedGuildStore", "getGuildId", "getLastSelectedGuildId"),
    RelationshipStore: store("RelationshipStore", "isBlocked", "getFriendIDs"),
    ReadStateStore: store("ReadStateStore", "lastMessageId", "hasUnread", "getMentionCount"),
    GuildChannelStore: store("GuildChannelStore", "getChannels", "getDefaultChannel"),
    TypingStore: store("TypingStore", "getTypingUsers", "isTyping"),
    PresenceStore: store("PresenceStore", "getStatus", "getActivities"),
};

const cache: Partial<Common> = {};
export const common = {} as Common;
for (const name of Object.keys(lookups) as (keyof Common)[]) {
    Object.defineProperty(common, name, {
        enumerable: true,
        get: () => (cache[name] ??= lookups[name]() ?? undefined),
    });
}
