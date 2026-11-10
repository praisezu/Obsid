// Capri's phrasing recognition: what she treats as "do something" vs plain chat. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { common } from "./stubs/core";
import capri from "../src/plugins/capri";

// A tiny fake Discord: one friend, 415i. (display name Marcelothedon)
const friend = { id: "1", username: "415i.", globalName: "Marcelothedon" };
common.RelationshipStore = { getFriendIDs: () => ["1"], getNickname: () => null };
common.UserStore = { getUser: (id: string) => (id === "1" ? friend : null), getCurrentUser: () => ({ id: "me" }), getUsers: () => ({ 1: friend }) };
common.ChannelStore = { getMutablePrivateChannels: () => ({}), getDMFromUserId: () => null };
common.SelectedGuildStore = { getGuildId: () => null };
common.SelectedChannelStore = { getChannelId: () => null };

/** Runs a phrase through her and records what she'd do (without doing it) */
function hear(phrase: string) {
    const c: any = Object.create(capri as any);
    let did = "chat";
    c.confirmSend = (text: string, who: string) => { did = `send "${text}" to ${who}`; };
    c.confirmAction = (q: string) => { did = `ask: ${q}`; };
    c.say = (t: string) => { did = `say: ${t}`; };
    if (!c.tryAction(phrase) && !c.trySend(phrase)) return "chat";
    return did;
}

test("send requests in different wordings", () => {
    assert.equal(hear('hey capri can u send "hi" to 415i'), 'send "hi" to 415i');
    assert.equal(hear("send hi to 415i please"), 'send "hi" to 415i');
    assert.equal(hear("can you send 415i a message saying hi"), 'send "hi" to 415i');
    assert.equal(hear("send a message to 415i saying hi"), 'send "hi" to 415i');
    assert.equal(hear("tell 415i hi for me"), 'send "hi" to 415i');
    assert.equal(hear("message 415i: hey whats up"), 'send "hey whats up" to 415i');
    assert.equal(hear("dm 415i saying yo"), 'send "yo" to 415i');
});

test("actions ask first", () => {
    assert.match(hear("friend 415i"), /^ask: send Marcelothedon \(@415i\.\) a friend request\?/);
    assert.match(hear("block 415i"), /^ask: block Marcelothedon\?/);
    assert.match(hear("unfriend 415i"), /^ask: remove Marcelothedon/);
});

test("ordinary chat is never mistaken for an action", () => {
    for (const phrase of ["tell me a joke", "what song should i play", "what's 12 times 7?", "who made you?", "hey capri how are you"])
        assert.equal(hear(phrase), "chat", phrase);
});
