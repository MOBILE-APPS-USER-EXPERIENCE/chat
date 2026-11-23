/** @jest-environment node */

import type { ChatRow } from "../storage/types";
import {
  filterChatsByName,
  selectBrowsableChats,
  selectInvitations,
} from "./chat-lists";

function chat(patch: Partial<ChatRow> = {}): ChatRow {
  return {
    id: 1,
    name: "Test",
    visibility: "private",
    directchat: false,
    role: "member",
    joined: true,
    ownerUserid: "owner",
    firstSeenAt: 1,
    missingSince: null,
    syncedAt: 1,
    polledUpTo: 0,
    lastPolledAt: null,
    ...patch,
  };
}

describe("chat list selectors", () => {
  it("selects only open, unjoined invitations", () => {
    expect(selectInvitations([
      chat({ role: "invited", joined: false }),
      chat({ id: 2, role: "invited", joined: true }),
      chat({ id: 3, role: "invited", joined: false, missingSince: 10 }),
      chat({ id: 4, role: "member", joined: false }),
    ]).map((row) => row.id)).toEqual([1]);
  });

  it("excludes joined, invited, direct, main and missing public chats", () => {
    expect(selectBrowsableChats([
      chat({ id: 1, name: "Public", visibility: "public", joined: false }),
      chat({ id: 2, name: "Joined", visibility: "public", joined: true }),
      chat({ id: 3, name: "Invited", visibility: "public", joined: false, role: "invited" }),
      chat({ id: 4, name: "Direct", visibility: "public", joined: false, directchat: true }),
      chat({ id: 0, name: "Main", visibility: "public", joined: false }),
      chat({ id: 5, name: "Missing", visibility: "public", joined: false, missingSince: 10 }),
    ]).map((row) => row.id)).toEqual([1]);
  });

  it("filters names case-insensitively by substring", () => {
    const chats = [chat({ id: 1, name: "Java Basics" }), chat({ id: 2, name: "C++" })];
    expect(filterChatsByName(chats, "  JAVA  ").map((row) => row.id)).toEqual([1]);
    expect(filterChatsByName(chats, "")).toEqual(chats);
  });
});
