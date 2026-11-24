import type { KeyValueStore } from "./ports";

export type ChatMessageTags = Record<number, string[]>;
export type AccountMessageTags = Record<number, ChatMessageTags>;

function accountKey(accountId: string) {
  return `chat.messageTags.v1.${accountId}`;
}

export class MessageTagsStore {
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async list(accountId: string, chatId: number): Promise<ChatMessageTags> {
    const chats = await this.listAll(accountId);
    return chats[chatId] ?? {};
  }

  async listAll(accountId: string): Promise<AccountMessageTags> {
    await this.writes;
    return await this.kv.getJson<AccountMessageTags>(accountKey(accountId)) ?? {};
  }

  set(accountId: string, chatId: number, messageId: number, tags: readonly string[]): Promise<ChatMessageTags> {
    return this.enqueue(async () => {
      const key = accountKey(accountId);
      const chats = await this.kv.getJson<AccountMessageTags>(key) ?? {};
      const chat = chats[chatId] ?? {};
      const names = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
      if (names.length) chat[messageId] = names;
      else delete chat[messageId];
      if (Object.keys(chat).length) chats[chatId] = chat;
      else delete chats[chatId];
      if (Object.keys(chats).length) await this.kv.setJson(key, chats);
      else await this.kv.remove(key);
      return chat;
    });
  }

  removeAccount(accountId: string): Promise<void> {
    return this.enqueue(() => this.kv.remove(accountKey(accountId)));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writes.then(operation);
    // A failed write is reported to its caller and does not block subsequent writes.
    this.writes = result.catch(() => undefined);
    return result;
  }
}
