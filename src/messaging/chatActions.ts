import { ApiError } from "@/api/apiClient";

import type { ChatActionsApi, ChatRefreshResult } from "./ports";
import { InvalidTokenError } from "./errors";

export type ChatActionResult = {
  chatId: number;
  refreshed: boolean;
};

export class InviteAfterCreateError extends Error {
  constructor(
    readonly chatId: number,
    readonly cause: unknown,
  ) {
    super("Invitation after chat creation failed");
    this.name = "InviteAfterCreateError";
  }
}

export type ChatActionsDeps = {
  api: ChatActionsApi;
  refreshChats: () => Promise<ChatRefreshResult>;
  onInvalidToken?: () => void;
};

export class ChatActions {
  constructor(private readonly deps: ChatActionsDeps) {}

  async createGroup(input: {
    name: string;
    isPublic: boolean;
  }): Promise<ChatActionResult> {
    const name = input.name.trim();
    if (name.length < 2)
      throw new Error("Der Name ist zu kurz (mindestens 2 Zeichen).");
    try {
      const chatId = await this.deps.api.createChat(name, input.isPublic, false);
      const refreshed = await this.refreshAfterCreate();
      return { chatId, refreshed };
    } catch (error) {
      return this.rethrowAfterInvalidToken(error);
    }
  }

  async createDirectChat(input: {
    name: string;
    inviteeHash: string;
  }): Promise<ChatActionResult> {
    const name = input.name.trim();
    if (name.length < 2)
      throw new Error("Der Name ist zu kurz (mindestens 2 Zeichen).");
    const inviteeHash = input.inviteeHash.trim();
    if (inviteeHash.length === 0)
      throw new Error("Einladungshash darf nicht leer sein.");
    let chatId: number;
    try {
      chatId = await this.deps.api.createChat(name, false, true);
    } catch (error) {
      return this.rethrowAfterInvalidToken(error);
    }

    const refreshed = await this.refreshAfterCreate();
    try {
      await this.deps.api.invite(chatId, inviteeHash);
      return { chatId, refreshed };
    } catch (error) {
      if (error instanceof InvalidTokenError || (error instanceof ApiError && error.code === 456)) {
        this.deps.onInvalidToken?.();
      }
      throw new InviteAfterCreateError(chatId, error);
    }
  }

  async invite(chatId: number, hash: string): Promise<boolean> {
    const inviteHash = hash.trim();
    if (inviteHash.length === 0)
      throw new Error("Einladungshash darf nicht leer sein.");
    try {
      await this.deps.api.invite(chatId, inviteHash);
      return this.refreshAfterCreate();
    } catch (error) {
      return this.rethrowAfterInvalidToken(error);
    }
  }

  private async refreshAfterCreate(): Promise<boolean> {
    try {
      const result = await this.deps.refreshChats();
      return result === "updated";
    } catch {
      return false;
    }
  }

  private rethrowAfterInvalidToken(error: unknown): never {
    if (error instanceof InvalidTokenError || (error instanceof ApiError && error.code === 456))
      this.deps.onInvalidToken?.();
    throw error;
  }
}
