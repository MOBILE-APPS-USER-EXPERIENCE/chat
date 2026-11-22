import type { AccountStorage } from "../storage/ports";
import type {
  ChatSnapshot,
  ProfileRow,
  RawMessageInput,
} from "../storage/types";

export type ProfileInput = Omit<ProfileRow, "fetchedAt" | "missingSince">;

export interface SyncApi {
  getChats(): Promise<ChatSnapshot[]>;
  getProfiles(): Promise<ProfileInput[]>;
  getMessages(chatId: number, fromId: number): Promise<RawMessageInput[]>;
  postMessage(chatId: number, text: string, important: boolean): Promise<void>;
}

export type SyncConfig = {
  /** Minimum time between two getprofiles calls. */
  profilesIntervalMs: number;
  /** Minimum time between two existence checks of the same missing chat. */
  missingCheckIntervalMs: number;
  /** Minimum time between two polls of the same chat that is not open. */
  otherChatsIntervalMs: number;
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  profilesIntervalMs: 10 * 60_000,
  missingCheckIntervalMs: 60_000,
  otherChatsIntervalMs: 30_000,
};

export type SyncDeps = {
  api: SyncApi;
  storage: Pick<AccountStorage, "chats" | "profiles" | "messages">;
  now: () => number;
  /** False once the account this service belongs to is no longer the active one. */
  isCurrent: () => boolean;
  /** Keeps the service free of `src/api` imports (see `isNetworkError` in `apiAdapter.ts`). */
  isNetworkError: (error: unknown) => boolean;
  onInvalidToken?: () => void;
  config?: Partial<SyncConfig>;
};

export type PollResult =
  | { status: "skipped" } // unknown chat or not joined
  | { status: "ok"; inserted: number }
  | { status: "reset"; inserted: number } // content mismatch, local copy rebuilt
  | { status: "chat_not_found" } // 458: the caller decides about purge
  | { status: "aborted" }; // isCurrent() turned false, nothing was written

export type SyncErrorInfo = { chatId: number | null; message: string };

export type CycleDetails = {
  chats: "updated" | "failed";
  profiles: "skipped" | "updated" | "conflict" | "failed";
  polled: { chatId: number; result: PollResult }[];
  purged: number[];
  errors: SyncErrorInfo[];
};

export type CycleResult =
  | ({ status: "ok" } & CycleDetails)
  | { status: "offline" }
  | { status: "invalid_token" }
  | { status: "aborted" };

export type CycleOptions = { openChatId?: number };
