// Type-only import of the storage port: no runtime value from `src/storage` is pulled in, and
// `src/messaging/ports.ts` already type-imports `AccountStorage` the same way.
import type { AccountStorage } from "../../storage/ports";
import { OutboxService, type OutboxDeps } from "../outboxService";
import type {
  CycleOptions,
  CycleResult,
  PollResult,
  SyncApi,
  SyncConfig,
  SyncDeps,
} from "../ports";
import { SyncService } from "../syncService";
import type { ForegroundSignal } from "./foregroundSignal";
import type { StorageEvents } from "./storageEvents";

const DEFAULT_INTERVAL_MS = 5000;

export type SessionLike = {
  getState(): {
    status: "initializing" | "signed_out" | "signed_in";
    account?: { id: string };
  };
  subscribe(listener: () => void): () => void;
};

export type SchedulerDeps = {
  session: SessionLike;
  openAccountStorage: (accountId: string) => Promise<AccountStorage>;
  createSyncApi: () => SyncApi;
  foreground: ForegroundSignal;
  events: StorageEvents;
  now: () => number;
  isNetworkError: (error: unknown) => boolean;
  onInvalidToken: () => void;
  /** Generates the local id for a newly enqueued outbox row. */
  newId: () => string;
  intervalMs?: number;
  syncConfig?: Partial<SyncConfig>;
};

/**
 * Mirrors `CycleResult['status']`, plus `'none'` before the first cycle ever ran and
 * `'storage_error'` for a failure to open the account storage or build the sync api — kept
 * distinct from `'offline'` (a network failure reported by a *completed* cycle) so a future UI
 * can tell the two apart.
 */
export type SyncRuntimeStatusValue =
  | CycleResult["status"]
  | "none"
  | "storage_error";
export type SyncRuntimeStatus = {
  status: SyncRuntimeStatusValue;
  lastAttemptAt: number | null;
};

/**
 * Orchestrates one `SyncService` and one `OutboxService` per signed-in account: opens/closes
 * storage as the session changes, runs cycles on an interval while the app is in the
 * foreground, drains the outbox alongside each cycle, and republishes the outcome through
 * `StorageEvents`. No Expo/React imports; everything that touches a platform or a singleton is
 * injected.
 */
export class SyncScheduler {
  private readonly intervalMs: number;

  private started = false;
  private stopped = true;
  private generation = 0;
  private currentAccountId: string | null = null;
  private storage: AccountStorage | null = null;
  private syncService: SyncService | null = null;
  private outboxService: OutboxService | null = null;
  private openChatId: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private outboxInFlight = false;
  private sessionUnsub: (() => void) | null = null;
  private foregroundUnsub: (() => void) | null = null;
  private statusSnapshot: SyncRuntimeStatus = {
    status: "none",
    lastAttemptAt: null,
  };
  private readonly statusListeners = new Set<() => void>();

  constructor(private readonly deps: SchedulerDeps) {
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.sessionUnsub = this.deps.session.subscribe(() => {
      void this.handleSessionChange();
    });
    this.foregroundUnsub = this.deps.foreground.subscribe(() => {
      this.handleForegroundChange();
    });
    void this.handleSessionChange();
  }

  stop(): void {
    if (!this.started) return;
    this.stopped = true;
    this.started = false;
    this.generation += 1;
    this.clearTimer();
    this.sessionUnsub?.();
    this.sessionUnsub = null;
    this.foregroundUnsub?.();
    this.foregroundUnsub = null;
    const service = this.syncService;
    const outboxService = this.outboxService;
    const storage = this.storage;
    this.syncService = null;
    this.outboxService = null;
    this.storage = null;
    this.currentAccountId = null;
    this.resetStatus();
    if (service !== null) service.dispose();
    if (outboxService !== null) outboxService.dispose();
    if (storage !== null) {
      void storage.close().catch(() => {
        // Best-effort close during teardown; the caller is tearing the app down anyway.
      });
    }
  }

  setOpenChatId(chatId: number | null): void {
    this.openChatId = chatId;
  }

  getAccountStorage(): AccountStorage | null {
    return this.storage;
  }

  getStatus(): SyncRuntimeStatus {
    return this.statusSnapshot;
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async pollNow(chatId: number): Promise<PollResult> {
    if (this.syncService === null) return { status: "aborted" };
    let result: PollResult;
    try {
      result = await this.syncService.pollNow(chatId);
    } catch {
      // SyncService.pollNow already called onInvalidToken for an invalid token before
      // rethrowing; network and other errors are swallowed here so a manual refresh never
      // throws into the caller. The next scheduled cycle (or a later pollNow) retries.
      return { status: "aborted" };
    }
    if (
      (result.status === "ok" || result.status === "reset") &&
      result.inserted > 0
    ) {
      this.deps.events.emitMessages(chatId);
    }
    return result;
  }

  /**
   * Enqueues one text message for the active account and immediately kicks off a send attempt.
   * Throws (plain `Error`) when there is no active account storage yet, or when `text` is empty
   * after trimming — the caller (the composer UI) shows this to the user.
   */
  async enqueueMessage(chatId: number, text: string): Promise<void> {
    if (this.outboxService === null) {
      throw new Error("No active account to enqueue a message into");
    }
    await this.outboxService.enqueue(chatId, text);
    this.deps.events.emitOutbox(chatId);
    this.flushOutbox(chatId);
  }

  /**
   * Fires an immediate outbox drain. Fire-and-forget: callers must not await this. `chatId` is
   * accepted for a future chat-scoped drain; `OutboxService.drain()` currently processes every
   * due row across all chats regardless, so the parameter has no effect yet.
   */
  flushOutbox(chatId?: number): void {
    void chatId;
    void this.runOutboxDrain(this.generation);
  }

  // ---- session / foreground transitions --------------------------------------------------

  private async handleSessionChange(): Promise<void> {
    if (this.stopped) return;
    const state = this.deps.session.getState();
    const nextAccountId =
      state.status === "signed_in" && state.account ? state.account.id : null;
    if (nextAccountId === this.currentAccountId) return;

    this.generation += 1;
    const generation = this.generation;
    this.clearTimer();
    const previousService = this.syncService;
    const previousOutboxService = this.outboxService;
    const previousStorage = this.storage;
    this.syncService = null;
    this.outboxService = null;
    this.storage = null;
    this.currentAccountId = nextAccountId;
    this.resetStatus();

    if (previousService !== null) previousService.dispose();
    if (previousOutboxService !== null) previousOutboxService.dispose();
    if (previousStorage !== null) {
      try {
        await previousStorage.close();
      } catch {
        // Closing a discarded account's storage is best-effort; it is no longer active.
      }
    }
    if (this.stopped || generation !== this.generation) return; // superseded while closing
    if (nextAccountId === null) return;

    if (this.deps.foreground.isForeground()) {
      void this.runTickAndReschedule(generation);
    } else {
      void this.tryOpen(generation);
    }
  }

  private handleForegroundChange(): void {
    if (this.stopped || this.currentAccountId === null) return;
    this.clearTimer();
    if (this.deps.foreground.isForeground()) {
      void this.runTickAndReschedule(this.generation);
    }
    // Going to background: the timer is already cleared above; the service/storage stay open.
  }

  // ---- cycle loop --------------------------------------------------------------------------

  private scheduleNext(generation: number, delayMs: number): void {
    if (this.stopped || generation !== this.generation) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runTickAndReschedule(generation);
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async runTickAndReschedule(generation: number): Promise<void> {
    if (this.stopped || generation !== this.generation) return;
    if (!this.deps.foreground.isForeground()) return;
    if (this.inFlight) return; // a tick is already running; it reschedules itself when done
    this.inFlight = true;
    try {
      await this.tick(generation);
    } finally {
      this.inFlight = false;
    }
    if (this.stopped || generation !== this.generation) return;
    if (!this.deps.foreground.isForeground()) return; // became background while the tick ran
    this.scheduleNext(generation, this.intervalMs);
  }

  private async tick(generation: number): Promise<void> {
    if (this.syncService === null) {
      const opened = await this.tryOpen(generation);
      if (!opened) return;
    }
    if (
      this.stopped ||
      generation !== this.generation ||
      this.syncService === null
    )
      return;
    const opts: CycleOptions = {};
    if (this.openChatId !== null) opts.openChatId = this.openChatId;
    const result = await this.syncService.runCycle(opts);
    if (this.stopped || generation !== this.generation) return;
    this.applyCycleResult(result);
    // The outbox is drained alongside the sync cycle, not as part of it: an unexpected outbox
    // failure is caught inside `runOutboxDrain` and must never abort chat polling.
    await this.runOutboxDrain(generation);
  }

  private async runOutboxDrain(generation: number): Promise<void> {
    if (this.stopped || generation !== this.generation) return;
    if (this.outboxService === null) return;
    if (this.outboxInFlight) return; // a drain is already running; this call is redundant
    this.outboxInFlight = true;
    try {
      await this.outboxService.drain();
    } catch {
      // `drain()` writes ordinary send failures as 'failed' rows and never throws for them;
      // only a genuinely unexpected storage error reaches here. Swallow it so a broken outbox
      // never blocks chat polling — the next tick or flushOutbox() call retries.
    } finally {
      this.outboxInFlight = false;
    }
  }

  private async tryOpen(generation: number): Promise<boolean> {
    const accountId = this.currentAccountId;
    if (accountId === null || this.stopped || generation !== this.generation)
      return false;
    let storage: AccountStorage | null = null;
    try {
      storage = await this.deps.openAccountStorage(accountId);
      if (this.stopped || generation !== this.generation) {
        await storage.close().catch(() => {
          // Superseded while opening: discard this handle; the next open starts clean.
        });
        return false;
      }
      const api = this.deps.createSyncApi();
      const serviceDeps: SyncDeps = {
        api,
        storage,
        now: this.deps.now,
        isCurrent: () => this.isCurrentAccount(accountId, generation),
        isNetworkError: this.deps.isNetworkError,
        onInvalidToken: this.deps.onInvalidToken,
      };
      if (this.deps.syncConfig !== undefined)
        serviceDeps.config = this.deps.syncConfig;
      const syncService = new SyncService(serviceDeps);

      const outboxDeps: OutboxDeps = {
        api,
        storage,
        now: this.deps.now,
        isCurrent: () => this.isCurrentAccount(accountId, generation),
        isNetworkError: this.deps.isNetworkError,
        onInvalidToken: this.deps.onInvalidToken,
        newId: this.deps.newId,
        onRowChanged: (chatId) => this.deps.events.emitOutbox(chatId),
        // Shrinks the gap between the optimistic row disappearing and the real message showing
        // up: instead of waiting for the next ~5s cycle, poll this one chat right away. Reuses
        // `pollNow`, which already serializes with cycle polls of the same chat and only emits
        // `emitMessages` when something was actually inserted. Fire-and-forget: a slow or
        // failing poll must not delay draining the next outbox row.
        onSent: (chatId) => {
          void this.pollNow(chatId);
        },
      };
      const outboxService = new OutboxService(outboxDeps);
      // Recovers rows left 'sending' by a crash mid-send. Treated the same as a failed storage
      // open on failure: discard everything constructed so far and retry on the next tick.
      await outboxService.init();
      if (this.stopped || generation !== this.generation) {
        outboxService.dispose();
        syncService.dispose();
        await storage.close().catch(() => {
          // Superseded while initializing the outbox: discard cleanly.
        });
        return false;
      }

      this.storage = storage;
      this.syncService = syncService;
      this.outboxService = outboxService;
      return true;
    } catch {
      if (storage !== null) {
        await storage.close().catch(() => {
          // Best-effort cleanup after a failed open/init; nothing was assigned yet.
        });
      }
      if (this.stopped || generation !== this.generation) return false;
      // Opening storage, building the sync api, or initializing the outbox failed; keep the
      // scheduler alive and retry later (next interval tick while foreground, or the next
      // foreground transition).
      this.setStatus("storage_error");
      return false;
    }
  }

  private isCurrentAccount(accountId: string, generation: number): boolean {
    return (
      !this.stopped &&
      generation === this.generation &&
      this.currentAccountId === accountId
    );
  }

  private applyCycleResult(result: CycleResult): void {
    this.setStatus(result.status);
    if (result.status !== "ok") return;
    if (result.chats === "updated" || result.purged.length > 0)
      this.deps.events.emitChats();
    for (const entry of result.polled) {
      const pollResult = entry.result;
      if (
        (pollResult.status === "ok" || pollResult.status === "reset") &&
        pollResult.inserted > 0
      ) {
        this.deps.events.emitMessages(entry.chatId);
      }
    }
    for (const chatId of result.purged) this.deps.events.emitMessages(chatId);
  }

  // ---- status pub/sub ------------------------------------------------------------------------

  private setStatus(status: SyncRuntimeStatusValue): void {
    this.statusSnapshot = { status, lastAttemptAt: this.deps.now() };
    this.notifyStatus();
  }

  private resetStatus(): void {
    this.statusSnapshot = { status: "none", lastAttemptAt: null };
    this.notifyStatus();
  }

  private notifyStatus(): void {
    for (const listener of [...this.statusListeners]) listener();
  }
}
