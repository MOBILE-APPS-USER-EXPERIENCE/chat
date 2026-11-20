import type { AccountStorage, AccountStorageFactory, KeyValueStore } from './ports';
import type { StorageEnvironment } from './storageEnvironment';

/**
 * Chooses the account storage backend once, lazily, on the first `open`/`destroy`.
 *
 * The resolution is memoized as one promise, so concurrent first calls load SQLite at most once
 * and agree on the mode. Native always uses SQLite and lets open errors propagate. Web first
 * checks the capabilities SQLite needs (isolation, secure context, OPFS); a missing capability
 * degrades to memory without ever loading the SQLite backend. With all capabilities present the
 * first open is a trial: only one open runs it, all concurrent opens wait for its outcome, and if
 * it throws every one of them ends up on memory with reason `open_failed`.
 *
 * `destroy` never throws: a failed deletion (or any deletion in memory mode, where a SQLite file
 * from an earlier session may still exist) is recorded in the KV store under
 * `storage.pendingDeletions` and retried in a later session in which SQLite works.
 */

export type StorageStatus =
    | { mode: 'unresolved' }
    | { mode: 'sqlite' }
    | { mode: 'memory'; reason: 'no_isolation' | 'no_secure_context' | 'no_opfs' | 'open_failed'; lastError?: string };

export type AccountStorageManagerDeps = {
    environment: () => StorageEnvironment;
    loadSqlite: () => Promise<AccountStorageFactory>;
    memory: AccountStorageFactory;
    kv: KeyValueStore;
};

const PENDING_DELETIONS_KEY = 'storage.pendingDeletions';

export class AccountStorageManager implements AccountStorageFactory {
    private status: StorageStatus = { mode: 'unresolved' };
    private backend: AccountStorageFactory | null = null;
    private resolution: Promise<void> | null = null;
    private initialRetry: Promise<void> | null = null;
    /** Settles (never rejects) when the web trial open has finished. */
    private trial: Promise<void> | null = null;
    /** On web, the first open after resolving to SQLite is the trial that may degrade to memory. */
    private webTrialPending = false;
    /** Serializes read-modify-write cycles on the pending deletion list. */
    private pendingQueue: Promise<void> = Promise.resolve();

    constructor(private readonly deps: AccountStorageManagerDeps) { }

    getStatus(): StorageStatus {
        return this.status;
    }

    async open(accountId: string): Promise<AccountStorage> {
        await this.resolve();
        await this.retryPendingDeletionsOnce();
        const storage = await this.openResolved(accountId);
        if (this.status.mode !== 'sqlite') return storage;
        // A re-opened account must not sit on the deletion retry list: its database exists again.
        // Only in SQLite mode: in memory mode no SQLite file was (re)created.
        try {
            await this.removeFromPending(accountId);
        } catch (error) {
            await storage.close();
            throw error;
        }
        return storage;
    }

    /** Never throws. */
    async destroy(accountId: string): Promise<void> {
        let deleted = false;
        try {
            await this.resolve();
            await this.trialSettled();
            if (this.backend === null) throw new Error('storage backend not resolved');
            await this.backend.destroy(accountId);
            // In memory mode only the memory db is gone; a SQLite file with this id may exist from
            // an earlier session, so the id must stay on the retry list.
            deleted = this.status.mode === 'sqlite';
        } catch {
            // A failed deletion must not break deregistration: it is recorded below and retried.
            deleted = false;
        }
        try {
            if (deleted) await this.removeFromPending(accountId);
            else await this.addToPending(accountId);
        } catch {
            // The KV store itself failed, so nothing more can be recorded. destroy must never
            // fail the session flow; at worst an orphaned database file stays on disk.
        }
    }

    /**
     * Best-effort retry of deletions that failed earlier. Resolves the backend first. In memory
     * mode it does nothing: a SQLite file cannot be deleted without SQLite, so the ids stay.
     */
    async retryPendingDeletions(): Promise<void> {
        await this.resolve();
        await this.trialSettled();
        const backend = this.backend;
        if (this.status.mode !== 'sqlite' || backend === null) return;

        const pending = await this.readPending();
        const deleted = new Set<string>();
        for (const accountId of pending) {
            try {
                await backend.destroy(accountId);
                deleted.add(accountId);
            } catch {
                // Still not deletable (locked file, ...): the id stays on the list for the next retry.
            }
        }
        if (deleted.size === 0) return;
        // Filter the current list instead of overwriting it: a concurrent destroy may have added ids.
        await this.mutatePending(ids => (ids.some(id => deleted.has(id)) ? ids.filter(id => !deleted.has(id)) : null));
    }

    private retryPendingDeletionsOnce(): Promise<void> {
        const existing = this.initialRetry;
        if (existing !== null) return existing;
        const run = this.retryPendingDeletions();
        this.initialRetry = run;
        // A failed run (KV error) must not be cached: the next open tries again. Callers still see it via `run`.
        void run.catch(() => {
            if (this.initialRetry === run) this.initialRetry = null;
        });
        return run;
    }

    private async openResolved(accountId: string): Promise<AccountStorage> {
        if (this.webTrialPending) {
            // No await between this check and the assignment inside runTrial: exactly one open is the trial.
            if (this.trial === null) return this.runTrial(accountId);
            await this.trial;
        }
        const backend = this.backend;
        if (backend === null) throw new Error('storage backend not resolved');
        return backend.open(accountId);
    }

    private runTrial(accountId: string): Promise<AccountStorage> {
        const attempt = this.openTrial(accountId);
        // Waiters only need to know that the trial settled; the first caller sees a rejection through `attempt`.
        this.trial = attempt.then(() => undefined, () => undefined);
        return attempt;
    }

    private async openTrial(accountId: string): Promise<AccountStorage> {
        const sqlite = this.backend;
        if (sqlite === null) throw new Error('storage backend not resolved');
        try {
            const storage = await sqlite.open(accountId);
            this.webTrialPending = false;
            return storage;
        } catch (error) {
            // The first open on web failed: degrade to memory and serve this very open from it.
            this.status = { mode: 'memory', reason: 'open_failed', lastError: errorMessage(error) };
            this.backend = this.deps.memory;
            this.webTrialPending = false;
            return this.deps.memory.open(accountId);
        }
    }

    private async trialSettled(): Promise<void> {
        if (this.trial !== null) await this.trial;
    }

    private resolve(): Promise<void> {
        const existing = this.resolution;
        if (existing !== null) return existing;
        const run = this.runResolve();
        this.resolution = run;
        // A failed resolution (for example a failing dynamic import) is not cached forever.
        void run.catch(() => {
            if (this.resolution === run) this.resolution = null;
        });
        return run;
    }

    private async runResolve(): Promise<void> {
        const environment = this.deps.environment();
        if (environment.kind === 'native') {
            this.backend = await this.deps.loadSqlite();
            this.status = { mode: 'sqlite' };
            return;
        }
        if (!environment.crossOriginIsolated || !environment.hasSharedArrayBuffer) {
            this.status = { mode: 'memory', reason: 'no_isolation' };
            this.backend = this.deps.memory;
            return;
        }
        if (!environment.isSecureContext) {
            this.status = { mode: 'memory', reason: 'no_secure_context' };
            this.backend = this.deps.memory;
            return;
        }
        if (!environment.hasOpfs) {
            this.status = { mode: 'memory', reason: 'no_opfs' };
            this.backend = this.deps.memory;
            return;
        }
        this.backend = await this.deps.loadSqlite();
        this.status = { mode: 'sqlite' };
        this.webTrialPending = true;
    }

    private async readPending(): Promise<string[]> {
        const value = await this.deps.kv.getJson(PENDING_DELETIONS_KEY);
        if (value === null) return [];
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return [];
        return value;
    }

    private addToPending(accountId: string): Promise<void> {
        return this.mutatePending(ids => (ids.includes(accountId) ? null : [...ids, accountId]));
    }

    private removeFromPending(accountId: string): Promise<void> {
        return this.mutatePending(ids => (ids.includes(accountId) ? ids.filter(id => id !== accountId) : null));
    }

    /** Read-modify-write on the pending list. `update` returns the new list, or null for "no change". */
    private mutatePending(update: (ids: string[]) => string[] | null): Promise<void> {
        const run = this.pendingQueue.then(async () => {
            const next = update(await this.readPending());
            if (next !== null) await this.deps.kv.setJson(PENDING_DELETIONS_KEY, next);
        });
        // The queue tail must always settle fine; callers still see the rejection through `run`.
        this.pendingQueue = run.then(() => undefined, () => undefined);
        return run;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
