/** Discord modules that plugins use a lot, found lazily (each is undefined until Discord loads it). */
import { findByProps } from "./webpack";

export interface Common {
    FluxDispatcher: any;
    UserStore: any;
    ChannelStore: any;
    GuildStore: any;
    MessageStore: any;
    SelectedChannelStore: any;
    SelectedGuildStore: any;
    RelationshipStore: any;
}

const lookups: Record<keyof Common, () => any> = {
    FluxDispatcher: () => findByProps("dispatch", "subscribe", "unsubscribe"),
    UserStore: () => findByProps("getCurrentUser", "getUser"),
    ChannelStore: () => findByProps("getChannel", "getDMFromUserId"),
    GuildStore: () => findByProps("getGuild", "getGuilds"),
    MessageStore: () => findByProps("getMessage", "getMessages"),
    SelectedChannelStore: () => findByProps("getChannelId", "getLastSelectedChannelId"),
    SelectedGuildStore: () => findByProps("getGuildId", "getLastSelectedGuildId"),
    RelationshipStore: () => findByProps("isBlocked", "getFriendIDs"),
};

const cache: Partial<Common> = {};
export const common = {} as Common;
for (const name of Object.keys(lookups) as (keyof Common)[]) {
    Object.defineProperty(common, name, {
        enumerable: true,
        get: () => (cache[name] ??= lookups[name]() ?? undefined),
    });
}
