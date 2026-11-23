/** @jest-environment node */

import { ApiError, NetworkError } from "@/api/apiClient";

import type { ChatRow, ProfileRow } from "@/storage/types";
import {
  chatDisplayName,
  describeChatActionError,
  findExistingDirectChat,
  resolveInvitee,
} from "./chat-actions";

const profile = (
  userid: string,
  hash: string,
  nickname: string | null = null,
): ProfileRow => ({
  userid,
  hash,
  nickname,
  fullname: null,
  fetchedAt: 1,
  missingSince: null,
});

const chat = (id: number, directchat = false): ChatRow => ({
  id,
  name: `Chat ${id}`,
  visibility: "private",
  directchat,
  role: "owner",
  joined: true,
  ownerUserid: "self",
  firstSeenAt: 1,
  missingSince: null,
  syncedAt: 1,
  polledUpTo: 0,
  lastPolledAt: null,
});

describe("resolveInvitee", () => {
  it("matches nickname and fullname case-insensitively and excludes self and missing profiles", () => {
    const profiles = [
      profile("selfit01", "selfhash", "Ich"),
      profile("janit02", "J4nHash1", "Jana"),
      { ...profile("oldit03", "oldhash2", "Alt"), missingSince: 5 },
    ];
    expect(resolveInvitee("jana", profiles, "SELFIT01").resolution).toEqual({
      type: "profile",
      profile: profiles[1],
    });
    expect(resolveInvitee("JANIT02", profiles, "selfit01").resolution).toEqual({
      type: "profile",
      profile: profiles[1],
    });
    expect(resolveInvitee("selfit01", profiles, "selfit01").resolution).toBeNull();
    expect(resolveInvitee("alt", profiles, "selfit01").matches).toEqual([]);
  });

  it("matches nickname and fullname without using hash substrings", () => {
    const jana = { ...profile("janit02", "AbCd1234", "Jana"), fullname: "Jana Müller" };
    expect(resolveInvitee("müller", [jana], "selfit01").resolution).toEqual({
      type: "profile",
      profile: jana,
    });
    expect(resolveInvitee("cd123", [jana], "selfit01").resolution).toBeNull();
  });

  it("selects a known profile for an exact case-sensitive hash", () => {
    const jana = profile("janit02", "AbCd1234", "Jana");
    expect(resolveInvitee("AbCd1234", [jana], "selfit01").resolution).toEqual({
      type: "profile",
      profile: jana,
    });
    expect(resolveInvitee("abcd1234", [jana], "selfit01").resolution).toEqual({
      type: "hash",
      hash: "abcd1234",
    });
  });

  it("offers raw hash only for 8-char alphanumeric input not userid-shaped", () => {
    expect(resolveInvitee("AbCd1234", [profile("janit02", "other")], "selfit01").resolution)
      .toEqual({ type: "hash", hash: "AbCd1234" });
    expect(resolveInvitee("AbCd12", [profile("janit02", "other")], "selfit01").resolution)
      .toBeNull();
  });

  it("excludes explicit userids and self", () => {
    const jana = profile("janit02", "JanaHash", "Jana");
    expect(resolveInvitee("jana", [jana], "janit02", ["janit02"]).matches).toEqual([]);
    expect(resolveInvitee("jana", [jana], "selfit01", ["janit02"]).matches).toEqual([]);
  });

  it("shows a userid-shaped missing-profile hint", () => {
    expect(resolveInvitee("abcdit02", [], "selfit01").resolution).toEqual({
      type: "userid-not-found",
      userid: "abcdit02",
    });
  });
});

describe("findExistingDirectChat", () => {
  it("finds a joined direct chat containing the other userid", () => {
    const chats = [chat(3, true), chat(4, false)];
    const members = new Map([
      [3, [{ userid: "selfit01" }, { userid: "janit02" }]],
      [4, [{ userid: "janit02" }]],
    ]);
    expect(
      findExistingDirectChat({ chats, membersByChat: members, otherUserid: "janit02" }),
    ).toBe(chats[0]);
  });
});

describe("chatDisplayName", () => {
  it("uses the other member name for direct chats and chat name for groups", () => {
    const direct = chat(3, true);
    expect(
      chatDisplayName({
        chat: direct,
        members: [{ userid: "selfit01" }, { userid: "janit02" }],
        profiles: [profile("janit02", "hash", "Jana")],
        selfUserid: "selfit01",
      }),
    ).toBe("Jana");
    expect(
      chatDisplayName({
        chat: chat(4, false),
        members: [],
        profiles: [],
        selfUserid: "selfit01",
      }),
    ).toBe("Chat 4");
  });
});

describe("describeChatActionError", () => {
  it("maps required chat action codes and network errors", () => {
    expect(describeChatActionError(new ApiError(462, "x"))).toBe(
      "Der Name ist zu kurz (mindestens 2 Zeichen).",
    );
    expect(describeChatActionError(new ApiError(463, "x"))).toBe(
      "Dieser Einladungshash ist unbekannt.",
    );
    expect(describeChatActionError(new ApiError(458, "x"))).toContain(
      "Einladung nicht möglich",
    );
    expect(describeChatActionError(new NetworkError())).toContain(
      "nicht erreichbar",
    );
  });
});
