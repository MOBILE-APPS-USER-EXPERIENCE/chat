import type {
  AccountEntry,
  ChatRow,
  ChatSnapshot,
  MemberRole,
  OutboxInput,
  OutboxRow,
  ProfileRow,
  RawMessage,
  RawMessageInput,
  ServerEntry,
} from "./types";

export interface SecretStore {
  /** Reads a secret, or returns null when it is absent. */
  get(key: string): Promise<string | null>;
  /** Stores a secret under the key. */
  set(key: string, value: string): Promise<void>;
  /** Removes a secret; absence is not an error. */
  delete(key: string): Promise<void>;
}

export const SecretKeys = {
  token: (accountId: string) => `token.${accountId}`,
  adminKey: (accountId: string) => `adminKey.${accountId}`,
};

export interface KeyValueStore {
  /** Reads and parses JSON, or returns null when it is absent. */
  getJson<T>(key: string): Promise<T | null>;
  /** Serializes and stores a JSON value under the key. */
  setJson<T>(key: string, value: T): Promise<void>;
  /** Removes a value; absence is not an error. */
  remove(key: string): Promise<void>;
}

export class AccountExistsError extends Error {}
export class ServerExistsError extends Error {}

/** Minimal async string storage. AsyncStorage satisfies this structurally. */
export interface AsyncStringBackend {
  /** Reads the raw string stored under the key, or null when it is absent. */
  getItem(key: string): Promise<string | null>;
  /** Writes the raw string under the key, replacing any previous value. */
  setItem(key: string, value: string): Promise<void>;
  /** Removes the key; absence is not an error. */
  removeItem(key: string): Promise<void>;
}

/** Thrown when a stored value is not valid JSON. The message contains the key, never the value. */
export class KeyValueParseError extends Error {}

/** Thrown when the stored registry document has an invalid shape. */
export class RegistryCorruptError extends Error {}

/** Thrown when the stored registry document has an unknown version. */
export class RegistryVersionError extends Error {}

export interface RegistryRepository {
  /** Returns all registered servers. */
  listServers(): Promise<ServerEntry[]>;
  /** Adds a server with a normalized URL, rejecting duplicate URLs. */
  addServer(name: string, url: string): Promise<ServerEntry>;
  /** Returns all registered accounts. */
  listAccounts(): Promise<AccountEntry[]>;
  /** Finds an account by server and case-insensitive userid. */
  findAccount(serverId: string, userid: string): Promise<AccountEntry | null>;
  /** Creates an active account, rejecting duplicate server/userid pairs. */
  createAccount(
    input: Omit<AccountEntry, "id" | "createdAt" | "status">,
  ): Promise<AccountEntry>;
  /** Updates mutable account fields and rejects unknown account ids. */
  updateAccount(
    id: string,
    patch: Partial<Omit<AccountEntry, "id" | "serverId" | "userid">>,
  ): Promise<void>;
  /** Removes an account and clears it when it is the active account. */
  removeAccount(id: string): Promise<void>;
  /** Returns the selected active account id, if any. */
  getActiveAccountId(): Promise<string | null>;
  /** Selects an existing account, or clears the selection with null. */
  setActiveAccountId(id: string | null): Promise<void>;
}

export interface ChatRepository {
  /** Lists chats, optionally filtering by joined status, ordered by id ascending. */
  list(filter?: { joined?: boolean }): Promise<ChatRow[]>;
  /** Gets a chat by id, or null when it is unknown. */
  get(id: number): Promise<ChatRow | null>;
  /** Lists the current members of a chat. */
  listMembers(chatId: number): Promise<{ userid: string; role: MemberRole }[]>;
  /** Atomically applies a snapshot without deleting omitted chats. */
  applySnapshot(chats: ChatSnapshot[], now: number): Promise<void>;
  /** Deletes a chat and all chat-scoped rows, or does nothing when unknown. */
  purge(chatId: number): Promise<void>;
}

export interface ProfileRepository {
  /** Gets a profile by userid, or null when it is unknown. */
  get(userid: string): Promise<ProfileRow | null>;
  /** Gets a profile by its unique hash, or null when it is unknown. */
  getByHash(hash: string): Promise<ProfileRow | null>;
  /** Upserts present profiles and marks omitted profiles missing without deleting. */
  applyDirectory(
    profiles: Omit<ProfileRow, "fetchedAt" | "missingSince">[],
    now: number,
  ): Promise<void>;
}

export interface MessageRepository {
  /** Gets a message by chat and server id, or null when it is unknown. */
  get(chatId: number, id: number): Promise<RawMessage | null>;
  /** Lists messages newest first by server id, optionally before an exclusive id. */
  listPage(
    chatId: number,
    opts: { beforeId?: number; limit: number },
  ): Promise<RawMessage[]>;
  /** Counts messages with a server id greater than the supplied id. */
  countAfter(chatId: number, afterId: number): Promise<number>;
  /** Atomically inserts new messages and advances the chat polling cursor. */
  appendBatch(
    chatId: number,
    msgs: RawMessageInput[],
    now: number,
  ): Promise<{ inserted: number; polledUpTo: number }>;
  /** Deletes all messages in a chat and resets its polling cursor. */
  resetChat(chatId: number): Promise<void>;
}

export interface OutboxRepository {
  /** Lists all outbox rows for a chat, oldest first. */
  listByChat(chatId: number): Promise<OutboxRow[]>;
  /** Lists rows due to be sent now (pending, or failed with nextRetryAt <= now), oldest first, across all chats. */
  listDue(now: number): Promise<OutboxRow[]>;
  /** Lists chat ids that have a sending row or a failed row with nextRetryAt in the future. */
  listBlockedChatIds(now: number): Promise<number[]>;
  /** Creates a pending row. Throws if the chat does not exist; changes nothing on failure. */
  enqueue(
    input: OutboxInput,
    clientMessageId: string,
    now: number,
  ): Promise<OutboxRow>;
  /** Transitions pending -> sending. A no-op (does not throw) if the row is not pending or unknown. */
  markSending(clientMessageId: string): Promise<void>;
  /** Transitions sending -> failed with the given message and next retry time. Unknown id: no-op. */
  markFailed(
    clientMessageId: string,
    error: string,
    nextRetryAt: number,
  ): Promise<void>;
  /** Deletes a row (used after a successful send). Unknown id: no-op. */
  remove(clientMessageId: string): Promise<void>;
  /** Removes a row only when it is not currently sending; returns the removed row, or null. */
  discard(clientMessageId: string): Promise<OutboxRow | null>;
  /** Resets every 'sending' row back to 'pending' (recovers from a crash mid-send). */
  resetStuckSending(): Promise<void>;
}

export interface AccountStorage {
  /** Provides the chat repository for this account. */
  chats: ChatRepository;
  /** Provides the profile repository for this account. */
  profiles: ProfileRepository;
  /** Provides the message repository for this account. */
  messages: MessageRepository;
  /** Provides the outbox repository for this account. */
  outbox: OutboxRepository;
  /** Closes the account storage. */
  close(): Promise<void>;
}

export interface AccountStorageFactory {
  /** Opens or creates storage for an account. */
  open(accountId: string): Promise<AccountStorage>;
  /** Destroys all storage for an account. */
  destroy(accountId: string): Promise<void>;
}
