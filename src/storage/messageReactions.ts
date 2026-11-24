import type { KeyValueStore } from "./ports";

export type ChatMessageReactions = Record<number, string>;
type AccountReactions = Record<number, ChatMessageReactions>;

export class MessageReactionsStore {
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async list(accountId: string, chatId: number): Promise<ChatMessageReactions> {
    await this.writes;
    const account = await this.kv.getJson<AccountReactions>(this.key(accountId));
    return account?.[chatId] ?? {};
  }

  toggle(accountId: string, chatId: number, messageId: number, emoji: string): Promise<ChatMessageReactions> {
    return this.enqueue(async () => {
      const key = this.key(accountId);
      const account = await this.kv.getJson<AccountReactions>(key) ?? {};
      const chat = account[chatId] ?? {};
      if (chat[messageId] === emoji) delete chat[messageId];
      else chat[messageId] = emoji;
      if (Object.keys(chat).length) account[chatId] = chat;
      else delete account[chatId];
      if (Object.keys(account).length) await this.kv.setJson(key, account);
      else await this.kv.remove(key);
      return chat;
    });
  }

  removeAccount(accountId: string): Promise<void> {
    return this.enqueue(() => this.kv.remove(this.key(accountId)));
  }

  private key(accountId: string) {
    return `chat.messageReactions.v1.${accountId}`;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writes.then(operation);
    this.writes = result.catch(() => undefined);
    return result;
  }
}
