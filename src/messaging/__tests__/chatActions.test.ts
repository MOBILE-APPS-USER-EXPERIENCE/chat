/** @jest-environment node */

import { ApiError, NetworkError } from "../../api/apiClient";
import {
  ChatActions,
  InviteAfterCreateError,
} from "../chatActions";
import type { ChatActionsApi } from "../ports";
import { InvalidTokenError } from "../errors";

class FakeChatActionsApi implements ChatActionsApi {
  chatId = 42;
  createCalls: { name: string; isPublic: boolean; directChat: boolean }[] = [];
  inviteCalls: { chatId: number; hash: string }[] = [];
  createError: unknown;
  inviteError: unknown;

  async createChat(name: string, isPublic: boolean, directChat: boolean) {
    this.createCalls.push({ name, isPublic, directChat });
    if (this.createError !== undefined) throw this.createError;
    return this.chatId;
  }

  async invite(chatId: number, hash: string) {
    this.inviteCalls.push({ chatId, hash });
    if (this.inviteError !== undefined) throw this.inviteError;
  }
}

describe("ChatActions", () => {
  it("creates a trimmed private or public group and refreshes chats", async () => {
    const api = new FakeChatActionsApi();
    const refreshChats = jest.fn().mockResolvedValue("updated");
    const actions = new ChatActions({ api, refreshChats });

    await expect(
      actions.createGroup({ name: "  Test  ", isPublic: false }),
    ).resolves.toEqual({ chatId: 42, refreshed: true });
    expect(api.createCalls).toEqual([
      { name: "Test", isPublic: false, directChat: false },
    ]);
  });

  it("validates names and hashes before requests", async () => {
    const api = new FakeChatActionsApi();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
    });
    await expect(
      actions.createGroup({ name: " A ", isPublic: false }),
    ).rejects.toThrow();
    await expect(
      actions.createDirectChat({ name: "Test", inviteeHash: " " }),
    ).rejects.toThrow();
    expect(api.createCalls).toHaveLength(0);
  });

  it("creates a direct chat and invites with no admin key", async () => {
    const api = new FakeChatActionsApi();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
    });
    await expect(
      actions.createDirectChat({
        name: " Luka – Jana ",
        inviteeHash: "AbCd1234",
      }),
    ).resolves.toEqual({ chatId: 42, refreshed: true });
    expect(api.createCalls[0]).toEqual({
      name: "Luka – Jana",
      isPublic: false,
      directChat: true,
    });
    expect(api.inviteCalls).toEqual([{ chatId: 42, hash: "AbCd1234" }]);
  });

  it("wraps invite failure after creation and remains retryable", async () => {
    const api = new FakeChatActionsApi();
    api.inviteError = new ApiError(463, "unknown");
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
    });
    await expect(
      actions.createDirectChat({ name: "Test", inviteeHash: "AbCd1234" }),
    ).rejects.toBeInstanceOf(InviteAfterCreateError);
  });

  it("calls invalid-token handling once and rethrows", async () => {
    const api = new FakeChatActionsApi();
    api.createError = new InvalidTokenError();
    const onInvalidToken = jest.fn();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
      onInvalidToken,
    });
    await expect(
      actions.createGroup({ name: "Test", isPublic: false }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    expect(onInvalidToken).toHaveBeenCalledTimes(1);
  });

  it("does not fail creation when refresh is offline", async () => {
    const api = new FakeChatActionsApi();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "offline",
    });
    await expect(
      actions.createGroup({ name: "Test", isPublic: true }),
    ).resolves.toEqual({ chatId: 42, refreshed: false });
  });

  it("passes NetworkError unchanged on invite", async () => {
    const api = new FakeChatActionsApi();
    api.inviteError = new NetworkError();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
    });
    await expect(actions.invite(42, "AbCd1234")).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("refreshes chats after a successful invite", async () => {
    const api = new FakeChatActionsApi();
    const actions = new ChatActions({
      api,
      refreshChats: async () => "updated",
    });

    await expect(actions.invite(42, " AbCd1234 ")).resolves.toBe(true);
    expect(api.inviteCalls).toEqual([{ chatId: 42, hash: "AbCd1234" }]);
  });
});
