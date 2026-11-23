import type { AccountStorage } from "../storage/ports";
import type { OutboxRow } from "../storage/types";
import { ChatNotFoundError, InvalidTokenError } from "./errors";
import type { SyncApi } from "./ports";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export type OutboxDeps = {
  api: SyncApi;
  storage: Pick<AccountStorage, "outbox">;
  now: () => number;
  /** False once the account this service belongs to is no longer the active one. */
  isCurrent: () => boolean;
  /** Keeps the service free of `src/api` imports, same as `SyncDeps.isNetworkError`. */
  isNetworkError: (error: unknown) => boolean;
  onInvalidToken?: () => void;
  /** Generates the local id for a newly enqueued row. Never `Date.now()`/random inside this class. */
  newId: () => string;
  /**
   * Called synchronously whenever `drain()` sends or newly fails a row, with the affected
   * chat id. Lets the caller republish a local-storage-changed event without changing
   * `drain()`'s `Promise<void>` return type; has no effect on retry behavior.
   */
  onRowChanged?: (
    chatId: number,
    reason: "sent" | "failed" | "discarded",
  ) => void;
  /**
   * Called synchronously right after a row's message was successfully posted and removed from
   * the outbox (never on a send failure, never on a network/invalid-token failure). Lets the
   * caller trigger an immediate poll of that chat, so the real message (now visible via
   * `getmessages`) replaces the optimistic row with as little delay as possible instead of
   * waiting for the next scheduled sync cycle. No envelope/correlation is attempted — see the
   * dbml note on `outbox` — this only shortens the window during which neither the pending row
   * nor the real message is shown; it does not try to eliminate it.
   */
  onSent?: (chatId: number) => void;
  /**
   * Reserved for a future retry cap; unlimited (`Infinity`) for now, per #38's "automatisches
   * senden bei Reconnect" — a message keeps retrying until it is sent.
   */
  maxAttempts?: number;
  /** Linear backoff base, in ms. */
  baseRetryDelayMs?: number;
  /** Linear backoff cap, in ms. */
  maxRetryDelayMs?: number;
};

const DEFAULT_BASE_RETRY_DELAY_MS = 2000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

/**
 * Drains the local outbox: sends due rows to the server one at a time and resolves each row's
 * local state (removed on success, 'failed' with backoff otherwise). Mirrors `SyncService`'s
 * `isCurrent()` discipline: every write that follows an await is preceded by a check, so a
 * superseded account never has its storage touched after the fact.
 */
export class OutboxService {
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private disposed = false;

  constructor(private readonly deps: OutboxDeps) {
    this.baseRetryDelayMs =
      deps.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    this.maxRetryDelayMs = deps.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  }

  /** Recovers from a crash mid-send. Call once per open, before the first `drain()`. */
  async init(): Promise<void> {
    await this.deps.storage.outbox.resetStuckSending();
  }

  /** Validates and enqueues one text message. Rejects with a plain Error for empty text. */
  async enqueue(chatId: number, text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("Message text must not be empty");
    const clientMessageId = this.deps.newId();
    await this.deps.storage.outbox.enqueue(
      {
        chatId,
        text: trimmed,
        important: false,
        photoUri: null,
        fileUri: null,
        position: null,
      },
      clientMessageId,
      this.deps.now(),
    );
  }

  /** Sends every due row, oldest first, one at a time. Never throws for ordinary send failures. */
  async drain(): Promise<void> {
    if (!this.alive()) return;
    const due = await this.deps.storage.outbox.listDue(this.deps.now());
    const blockedChatIds = new Set(
      await this.deps.storage.outbox.listBlockedChatIds(this.deps.now()),
    );
    const failedInDrain = new Set<number>();
    for (const row of due) {
      if (!this.alive()) return; // discard the remaining rows without writing
      if (blockedChatIds.has(row.chatId) || failedInDrain.has(row.chatId))
        continue;
      const stop = await this.sendOne(row);
      if (stop.failedInDrain) failedInDrain.add(row.chatId);
      if (stop.stop) return;
    }
  }

  /** Removes a failed/pending row, but leaves a currently sending row untouched. */
  async discard(clientMessageId: string): Promise<boolean> {
    const removed =
      await this.deps.storage.outbox.discard(clientMessageId);
    if (removed === null) return false;
    this.notifyRowChanged(removed.chatId, "discarded");
    return true;
  }

  /** After this, no further writes; an in-flight `drain()` finishes without writing. */
  dispose(): void {
    this.disposed = true;
  }

  /** Returns true when draining must stop (an invalid token was reported). */
  private async sendOne(
    row: OutboxRow,
  ): Promise<{ stop: boolean; failedInDrain: boolean }> {
    const transitioned =
      await this.deps.storage.outbox.markSending(row.clientMessageId);
    if (!transitioned) return { stop: false, failedInDrain: false };
    if (!this.alive()) return { stop: false, failedInDrain: false };
    let postSucceeded = false;
    try {
      await this.deps.api.postMessage(
        row.chatId,
        row.text ?? "",
        row.important,
      );
      postSucceeded = true;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        if (this.alive()) this.deps.onInvalidToken?.();
        // The row stays 'sending'; it is recovered by the next resetStuckSending() on open.
        return { stop: true, failedInDrain: false };
      }
      if (!this.alive())
        return { stop: false, failedInDrain: false }; // discard without writing markFailed()
      const message = this.deps.isNetworkError(error)
        ? "offline"
        : error instanceof ChatNotFoundError
          ? "chat_not_found"
          : describeError(error);
      const attempts = row.attempts + 1;
      const delay = Math.min(
        attempts * this.baseRetryDelayMs,
        this.maxRetryDelayMs,
      );
      await this.deps.storage.outbox.markFailed(
        row.clientMessageId,
        message,
        this.deps.now() + delay,
      );
      this.notifyRowChanged(row.chatId, "failed");
      if (this.deps.isNetworkError(error))
        return { stop: true, failedInDrain: true };
      return { stop: false, failedInDrain: true };
    }

    if (!postSucceeded) return { stop: false, failedInDrain: false };
    if (!this.alive()) return { stop: false, failedInDrain: false };
    await this.deps.storage.outbox.remove(row.clientMessageId);
    this.notifyRowChanged(row.chatId, "sent");
    this.notifySent(row.chatId);
    return { stop: false, failedInDrain: false };
  }

  private notifyRowChanged(
    chatId: number,
    reason: "sent" | "failed" | "discarded",
  ): void {
    try {
      this.deps.onRowChanged?.(chatId, reason);
    } catch {
      // Local UI callbacks must not change send success or failure bookkeeping.
    }
  }

  private notifySent(chatId: number): void {
    try {
      this.deps.onSent?.(chatId);
    } catch {
      // Poll callbacks must not turn a successful post into a resend.
    }
  }

  private alive(): boolean {
    return !this.disposed && this.deps.isCurrent();
  }
}
