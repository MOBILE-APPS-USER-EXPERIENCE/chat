import { ApiError, NetworkError } from "../api/apiClient";
import { getChats } from "../api/chatService";
import {
  postMessage as apiPostMessage,
  getMessages,
} from "../api/messageService";
import { getProfiles } from "../api/userService";
import { ChatNotFoundError, InvalidTokenError } from "./errors";
import {
  toChatSnapshots,
  toProfileInputs,
  toRawMessageInputs,
} from "./mappers";
import type { SyncApi } from "./ports";

/** The only file in `src/messaging` that imports `src/api`. */

export type SyncApiOptions = {
  /** Called with the number of invalid profile entries that were dropped from one response. */
  onProfilesDropped?: (count: number) => void;
};

/** For `SyncDeps.isNetworkError`. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof NetworkError;
}

/** 456 everywhere, 458 only where it means "chat does not exist". Everything else passes through. */
async function translated<T>(
  chatScoped: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 456) throw new InvalidTokenError();
      if (error.code === 458 && chatScoped) throw new ChatNotFoundError();
    }
    throw error;
  }
}

export function createSyncApi(options: SyncApiOptions = {}): SyncApi {
  // `useAdminKey` is always false: sync must never fetch admin-visible data.
  return {
    async getChats() {
      const chats = await translated(false, () => getChats(false));
      return toChatSnapshots(chats);
    },
    async getProfiles() {
      const users = await translated(false, () => getProfiles(false));
      const { profiles, dropped } = toProfileInputs(users);
      if (dropped > 0) options.onProfilesDropped?.(dropped);
      return profiles;
    },
    async getMessages(chatId, fromId) {
      const messages = await translated(true, () =>
        getMessages({ fromid: fromId, chatid: chatId, useAdminKey: false }),
      );
      return toRawMessageInputs(messages);
    },
    async postMessage(chatId, text, important) {
      // `postmessage` is chat-scoped: an invalid/non-member chatid answers 458 (docs/openapi.yaml).
      await translated(true, () =>
        apiPostMessage({ chatid: chatId, text, important }),
      );
    },
  };
}
