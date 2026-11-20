import type { AccountStorage, AccountStorageFactory, KeyValueStore } from './ports';
import type { StorageEnvironment } from './storageEnvironment';

/**
 * Chooses the account storage backend once, lazily, on the first `open`/`destroy`.
 *
 * Native always uses SQLite and lets open errors propagate. Web first checks the capabilities
 * SQLite needs (isolation, secure context, OPFS); a missing capability degrades to memory
 * without ever loading the SQLite backend. With all capabilities present it tries SQLite and
 * falls back to memory with reason `open_failed` if the first open throws.
 *
 * `destroy` must never fail the session flow: a failed deletion is recorded in the KV store
 * under `storage.pendingDeletions` and retried before the next open.
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
    private retriedPendingDeletions = false;
    /** On web, the first open after resolving to SQLite is the trial that may degrade to memory. */
    private webTrialPending = false;

    constructor(private readonly deps: AccountStorageManagerDeps) { }

    getStatus(): StorageStatus {
        return this.status;
    }

    async open(accountId: string): Promise<AccountStorage> {
        await this.resolve();
        await this.retryPendingDeletionsOnce();
        // A re-opened account must not sit on the deletion retry list: its database exists again.
        await this.removeFromPending(accountId);
        if (this.backend === null) throw new Error('storage backend not resolved');
        try {
            const storage = await this.backend.open(accountId);
            this.webTrialPending = false;
            return storage;
        } catch (error) {
            if (this.webTrialPending) {
                // The first open on web failed: degrade to memory and serve this very open from it.
                this.status = { mode: 'memory', reason: 'open_failed', lastError: errorMessage(error) };
                this.backend = this.deps.memory;
                this.webTrialPending = false;
                return this.backend.open(accountId);
            }
            throw error;
        }
    }

    async destroy(accountId: string): Promise<void> {
        await this.resolve();
        try {
            await this.backend?.destroy(accountId);
            await this.removeFromPending(accountId);
        } catch {
            // A failed deletion must not break deregistration; retry before the next open.
            const pending = await this.readPending();
            if (!pending.includes(accountId)) {
                await this.deps.kv.setJson(PENDING_DELETIONS_KEY, [...pending, accountId]);
            }
        }
    }

    /** Best-effort retry of deletions that failed earlier. */
    async retryPendingDeletions(): Promise<void> {
        const pending = await this.readPending();
        const remaining: string[] = [];
        for (const accountId of pending) {
            try {
                await this.backend?.destroy(accountId);
            } catch {
                remaining.push(accountId);
            }
        }
        await this.deps.kv.setJson(PENDING_DELETIONS_KEY, remaining);
    }

    private async retryPendingDeletionsOnce(): Promise<void> {
        if (this.retriedPendingDeletions) return;
        this.retriedPendingDeletions = true;
        await this.retryPendingDeletions();
    }

    private async resolve(): Promise<void> {
        if (this.backend !== null) return;
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
        this.webTrialPending = this.deps.environment().kind === 'web';
    }

    private async readPending(): Promise<string[]> {
        const value = await this.deps.kv.getJson(PENDING_DELETIONS_KEY);
        if (value === null) return [];
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return [];
        return value;
    }

    private async removeFromPending(accountId: string): Promise<void> {
        const pending = await this.readPending();
        if (!pending.includes(accountId)) return;
        await this.deps.kv.setJson(PENDING_DELETIONS_KEY, pending.filter(id => id !== accountId));
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
