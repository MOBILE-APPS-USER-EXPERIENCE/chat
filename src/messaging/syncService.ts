import type { ChatRow } from '../storage/types';
import { ChatNotFoundError, InvalidTokenError } from './errors';
import { pollChat } from './pollChat';
import type {
    ChatRefreshResult, CycleDetails, CycleOptions, CycleResult, PollResult, SyncConfig, SyncDeps, SyncErrorInfo,
} from './ports';
import { DEFAULT_SYNC_CONFIG } from './ports';

type StopReason = 'offline' | 'invalid_token' | 'aborted';
type Attempt<T> = { ok: true; value: T } | { ok: false };

/** Internal signal that ends the running cycle. */
class CycleStop extends Error {
    constructor(readonly reason: StopReason) {
        super(`Cycle stopped: ${reason}`);
        this.name = 'CycleStop';
    }
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

/** The repositories throw a plain Error whose message starts with "hash collision". */
function isHashCollision(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('hash collision');
}

/**
 * Orchestrates one sync cycle: chats, profiles, polling, and the 458 check for chats that
 * `getchats` stopped listing. No timers: the caller decides when to run a cycle. All throttle
 * state is in memory and per instance.
 */
export class SyncService {
    private readonly config: SyncConfig;
    private disposed = false;
    private running: Promise<CycleResult> | null = null;
    private lastProfilesAt: number | undefined;
    private readonly lastOtherPollAt = new Map<number, number>();
    private readonly lastMissingCheckAt = new Map<number, number>();
    /** Per-chat promise chain; entries never reject. */
    private readonly pollTails = new Map<number, Promise<void>>();

    constructor(private readonly deps: SyncDeps) {
        this.config = { ...DEFAULT_SYNC_CONFIG, ...deps.config };
    }

    /** A second call while a cycle runs returns the running promise (its options win). */
    runCycle(opts: CycleOptions = {}): Promise<CycleResult> {
        if (this.running !== null) return this.running;
        if (!this.alive()) return Promise.resolve({ status: 'aborted' });
        const run = this.executeCycle(opts).finally(() => {
            if (this.running === run) this.running = null;
        });
        this.running = run;
        return run;
    }

    /**
     * On-demand poll of one chat, serialized with cycle polls of the same chat. Errors propagate;
     * an invalid token additionally calls `onInvalidToken` (only if the account is still current).
     */
    async pollNow(chatId: number): Promise<PollResult> {
        if (!this.alive()) return { status: 'aborted' };
        try {
            return await this.pollSerialized(chatId);
        } catch (error) {
            if (error instanceof InvalidTokenError && this.alive()) this.deps.onInvalidToken?.();
            throw error;
        }
    }

    /**
     * Refreshes only the chat list. If a cycle is already running, wait for it to finish first
     * and then fetch once more, so a stale snapshot cannot overwrite a newer server snapshot.
     */
    async refreshChats(): Promise<ChatRefreshResult> {
        if (!this.alive()) return 'aborted';
        if (this.running !== null) {
            await this.running.catch(() => undefined);
            if (!this.alive()) return 'aborted';
        }
        const report: CycleDetails = {
            chats: 'failed',
            profiles: 'skipped',
            polled: [],
            purged: [],
            errors: [],
        };
        try {
            await this.syncChats(report);
            if (!this.alive()) return 'aborted';
            return report.chats === 'updated' ? 'updated' : 'failed';
        } catch (error) {
            if (!(error instanceof CycleStop)) return 'failed';
            if (!this.alive()) return 'aborted';
            if (error.reason === 'invalid_token') {
                this.deps.onInvalidToken?.();
                return 'invalid_token';
            }
            if (error.reason === 'offline') return 'offline';
            return 'aborted';
        }
    }

    /** After this, no storage writes and no new requests. An in-flight cycle finishes without writing. */
    dispose(): void {
        this.disposed = true;
        this.lastOtherPollAt.clear();
        this.lastMissingCheckAt.clear();
    }

    // ---- cycle -----------------------------------------------------------------------------

    private async executeCycle(opts: CycleOptions): Promise<CycleResult> {
        const report: CycleDetails = { chats: 'failed', profiles: 'skipped', polled: [], purged: [], errors: [] };
        try {
            this.assertAlive();
            await this.syncChats(report);
            await this.syncProfiles(report);
            await this.pollChats(opts, report);
            return { status: 'ok', ...report };
        } catch (error) {
            if (!(error instanceof CycleStop)) throw error;
            // A stale account must neither report its token nor its network state.
            if (!this.alive()) return { status: 'aborted' };
            if (error.reason === 'invalid_token') {
                this.deps.onInvalidToken?.();
                return { status: 'invalid_token' };
            }
            if (error.reason === 'offline') return { status: 'offline' };
            return { status: 'aborted' };
        }
    }

    private async syncChats(report: CycleDetails): Promise<void> {
        this.assertAlive();
        const fetched = await this.attempt(null, report.errors, () => this.deps.api.getChats());
        this.assertAlive();
        if (!fetched.ok) return;   // report.chats stays 'failed'; nothing is applied
        const applied = await this.attempt(null, report.errors, () =>
            this.deps.storage.chats.applySnapshot(fetched.value, this.deps.now()));
        report.chats = applied.ok ? 'updated' : 'failed';
    }

    private async syncProfiles(report: CycleDetails): Promise<void> {
        this.assertAlive();
        if (!this.isDue(this.lastProfilesAt, this.config.profilesIntervalMs)) return;
        const fetched = await this.attempt(null, report.errors, () => this.deps.api.getProfiles());
        this.assertAlive();
        if (!fetched.ok) {
            report.profiles = 'failed';
            return;
        }
        // Throttle on a successful fetch, also when applying conflicts: the same data would conflict again.
        this.lastProfilesAt = this.deps.now();
        try {
            await this.deps.storage.profiles.applyDirectory(fetched.value, this.deps.now());
            report.profiles = 'updated';
        } catch (error) {
            if (isHashCollision(error)) {
                report.profiles = 'conflict';
                return;
            }
            report.errors.push({ chatId: null, message: describeError(error) });
            report.profiles = 'failed';
        }
    }

    private async pollChats(opts: CycleOptions, report: CycleDetails): Promise<void> {
        this.assertAlive();
        const listed = await this.attempt(null, report.errors, () => this.deps.storage.chats.list());
        this.assertAlive();
        if (!listed.ok) return;
        const rows = listed.value;
        const handled = new Set<number>();

        // The open chat is polled every cycle, if joined.
        const open = opts.openChatId === undefined
            ? undefined
            : rows.find(row => row.id === opts.openChatId && row.joined);
        if (open !== undefined) {
            handled.add(open.id);
            await this.pollOne(open, report);
        }

        // Other chats: only when due, one request at a time (sequential, to spare the server).
        for (const row of rows) {
            if (handled.has(row.id) || !row.joined || row.missingSince !== null) continue;
            if (!this.isDue(this.lastOtherPollAt.get(row.id), this.config.otherChatsIntervalMs)) continue;
            handled.add(row.id);
            await this.pollOne(row, report);
        }

        // Chats that getchats stopped listing: existence check, at most once per interval.
        for (const row of rows) {
            if (handled.has(row.id) || row.missingSince === null) continue;
            if (!this.isDue(this.lastMissingCheckAt.get(row.id), this.config.missingCheckIntervalMs)) continue;
            this.lastMissingCheckAt.set(row.id, this.deps.now());
            const checked = await this.attempt(row.id, report.errors, () => this.checkMissing(row.id));
            if (checked.ok && checked.value) report.purged.push(row.id);
        }
    }

    private async pollOne(row: ChatRow, report: CycleDetails): Promise<void> {
        this.lastOtherPollAt.set(row.id, this.deps.now());
        const outcome = await this.attempt(row.id, report.errors, () => this.pollSerialized(row.id));
        if (!outcome.ok) return;
        if (outcome.value.status === 'aborted') throw new CycleStop('aborted');
        report.polled.push({ chatId: row.id, result: outcome.value });

        // An open chat that is also missing from getchats and now answers 458 is confirmed gone.
        if (outcome.value.status === 'chat_not_found' && row.missingSince !== null) {
            this.lastMissingCheckAt.set(row.id, this.deps.now());
            const gone = await this.attempt(row.id, report.errors, () => this.confirmGone(row.id));
            if (gone.ok && gone.value) report.purged.push(row.id);
        }
    }

    // ---- per-chat operations (serialized) --------------------------------------------------

    private pollSerialized(chatId: number): Promise<PollResult> {
        return this.serialized(chatId, () => pollChat(chatId, {
            api: this.deps.api,
            chats: this.deps.storage.chats,
            messages: this.deps.storage.messages,
            now: () => this.deps.now(),
            isCurrent: () => this.alive(),
        }));
    }

    /** True when the chat was purged. Only a 458 answer purges; every other outcome keeps the chat. */
    private checkMissing(chatId: number): Promise<boolean> {
        return this.serialized(chatId, async () => {
            const row = await this.deps.storage.chats.get(chatId);
            this.assertAlive();
            if (row === null || row.missingSince === null) return false;
            try {
                // Existence probe only: the answer is deliberately not stored (a left private chat stays as is).
                await this.deps.api.getMessages(chatId, row.polledUpTo);
            } catch (error) {
                if (!(error instanceof ChatNotFoundError)) throw error;
                this.assertAlive();
                await this.deps.storage.chats.purge(chatId);
                this.forget(chatId);
                return true;
            }
            return false;
        });
    }

    private confirmGone(chatId: number): Promise<boolean> {
        return this.serialized(chatId, async () => {
            const row = await this.deps.storage.chats.get(chatId);
            this.assertAlive();
            if (row === null || row.missingSince === null) return false;
            await this.deps.storage.chats.purge(chatId);
            this.forget(chatId);
            return true;
        });
    }

    private serialized<T>(chatId: number, task: () => Promise<T>): Promise<T> {
        const previous = this.pollTails.get(chatId) ?? Promise.resolve();
        const run = previous.then(task);
        // The tail never rejects, so one failed task cannot block the chain.
        const tail = run.then(() => undefined, () => undefined);
        this.pollTails.set(chatId, tail);
        void tail.then(() => {
            if (this.pollTails.get(chatId) === tail) this.pollTails.delete(chatId);
        });
        return run;
    }

    // ---- helpers ---------------------------------------------------------------------------

    /**
     * Runs one step. Fatal errors (invalid token, network) become a CycleStop; any other error is
     * collected in `errors` and the cycle goes on.
     */
    private async attempt<T>(
        chatId: number | null, errors: SyncErrorInfo[], operation: () => Promise<T>,
    ): Promise<Attempt<T>> {
        try {
            return { ok: true, value: await operation() };
        } catch (error) {
            if (error instanceof CycleStop) throw error;
            if (error instanceof InvalidTokenError) throw new CycleStop('invalid_token');
            if (this.deps.isNetworkError(error)) throw new CycleStop('offline');
            errors.push({ chatId, message: describeError(error) });
            return { ok: false };
        }
    }

    private alive(): boolean {
        return !this.disposed && this.deps.isCurrent();
    }

    private assertAlive(): void {
        if (!this.alive()) throw new CycleStop('aborted');
    }

    private isDue(last: number | undefined, intervalMs: number): boolean {
        return last === undefined || this.deps.now() - last >= intervalMs;
    }

    private forget(chatId: number): void {
        this.lastOtherPollAt.delete(chatId);
        this.lastMissingCheckAt.delete(chatId);
    }
}
