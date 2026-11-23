/** @jest-environment node */
import type { ChatRow, RawMessage } from "../storage/types";
import {
  chatActivityTime,
  formatChatListTime,
  previewText,
  sortChatsByActivity,
} from "./chat-list-view";

const chat = (id: number, firstSeenAt: number): ChatRow => ({
  id,
  name: `Chat ${id}`,
  visibility: "private",
  directchat: false,
  role: "member",
  joined: true,
  ownerUserid: null,
  firstSeenAt,
  missingSince: null,
  syncedAt: firstSeenAt,
  polledUpTo: 0,
  lastPolledAt: null,
});

const message = (chatId: number, id: number, overrides: Partial<RawMessage> = {}): RawMessage => ({
  chatId,
  id,
  userid: "user1",
  userNick: "Alex",
  userFullname: null,
  userHash: null,
  serverTime: null,
  sentAt: 100,
  receivedAt: 200,
  important: false,
  text: "Hallo",
  photoId: null,
  fileId: null,
  position: null,
  ...overrides,
});

describe("chat-list-view", () => {
  test("chatActivityTime and sortChatsByActivity named behavior", () => {
    const chats = [chat(1, 300), chat(2, 400), chat(3, 500)];
    const latest = {
      1: message(1, 8, { sentAt: 250, receivedAt: 999 }),
      2: message(2, 9, { sentAt: null, receivedAt: 600 }),
    };
    expect(chatActivityTime(chats[0], latest[1])).toBe(250);
    expect(chatActivityTime(chats[2], undefined)).toBe(500);
    expect(sortChatsByActivity(chats, latest).map((row) => row.id)).toEqual([2, 3, 1]);
  });

  test("sortChatsByActivity returns a copy and uses higher id for ties", () => {
    const chats = [chat(4, 100), chat(7, 100)];
    const sorted = sortChatsByActivity(chats, {});
    expect(sorted.map((row) => row.id)).toEqual([7, 4]);
    expect(sorted).not.toBe(chats);
  });

  test("previewText collapse whitespace and handles authors and attachments", () => {
    expect(previewText(message(1, 1, { text: "  Hallo\n  Welt  " }), "USER1", false)).toBe("Du: Hallo Welt");
    expect(previewText(message(1, 2, { userid: "user2", text: "Gruppe" }), "user1", false)).toBe("Alex: Gruppe");
    expect(previewText(message(1, 3, { userid: "user2", text: "Direkt" }), "user1", true)).toBe("Direkt");
    expect(previewText(message(1, 4, { userid: "user2", text: null, photoId: "p" }), "user1", false)).toBe("Alex: Foto");
    expect(previewText(message(1, 5, { text: "", fileId: "f", userid: "user1" }), "user1", true)).toBe("Du: Datei");
  });

  test("formatChatListTime named behavior", () => {
    const now = new Date(2026, 0, 7, 12, 0).getTime();
    expect(formatChatListTime(new Date(2026, 0, 7, 3, 4).getTime(), now)).toBe("03:04");
    expect(formatChatListTime(new Date(2026, 0, 6, 20, 0).getTime(), now)).toBe("Gestern");
    expect(formatChatListTime(new Date(2026, 0, 5, 20, 0).getTime(), now)).toBe("Mo");
    expect(formatChatListTime(new Date(2025, 11, 31, 20, 0).getTime(), now)).toBe("31.12.25");
  });
});
