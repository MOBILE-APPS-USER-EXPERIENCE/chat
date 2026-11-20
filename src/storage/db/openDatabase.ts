import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from './migrations/migrations';
import * as schema from './schema';
import type { AccountDb } from './types';

/**
 * Lazy opener for the per-account SQLite database.
 *
 * `expo-sqlite` must never be imported at module level: the web build is `output: "static"`, so
 * route modules are also evaluated in Node during export, where the wasm/worker build cannot
 * load. Everything Expo-specific is therefore imported inside the functions below.
 */

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export type OpenAccountDatabaseResult = {
    db: AccountDb;
    close(): Promise<void>;
};

type OpenedDatabase = {
    db: AccountDb;
    /** Idempotent: closing twice is not an error. */
    close(): Promise<void>;
};

type OpenEntry = {
    promise: Promise<OpenedDatabase>;
    /** Number of callers currently holding the handle. */
    refs: number;
};

/** One entry per account id, so concurrent callers share a single open and a single migration. */
const openDatabases = new Map<string, OpenEntry>();

function databaseName(accountId: string): string {
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
        throw new Error('Invalid account id');
    }
    return `chat_${accountId}.db`;
}

async function openAndMigrate(accountId: string): Promise<OpenedDatabase> {
    const name = databaseName(accountId);
    const SQLite = await import('expo-sqlite');
    const sqlite = await SQLite.openDatabaseAsync(name);

    let closed = false;
    const close = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await sqlite.closeAsync();
    };

    try {
        // Foreign keys are off by default in SQLite and are per connection.
        await sqlite.execAsync('PRAGMA foreign_keys = ON');
        // No WAL: the wa-sqlite VFS behind expo-sqlite on web implements no shared memory, so the
        // default rollback journal is used on every platform (see ADR-005).
        const db = drizzle(sqlite, { schema });
        await migrate(db, migrations);
        return { db, close };
    } catch (error) {
        // Never hand out a half-open handle. A failing close must not mask the migration error.
        try {
            await close();
        } catch {
            // Intentionally swallowed, see the comment above.
        }
        throw error;
    }
}

function withRelease(accountId: string, opened: OpenedDatabase): OpenAccountDatabaseResult {
    let released = false;
    return {
        db: opened.db,
        close: async () => {
            if (released) return;
            released = true;
            const entry = openDatabases.get(accountId);
            if (entry) {
                entry.refs -= 1;
                if (entry.refs > 0) return;
                openDatabases.delete(accountId);
            }
            await opened.close();
        },
    };
}

/**
 * Opens (and migrates) the database for an account. Concurrent calls for the same id share one
 * open; the returned `close` only closes the connection when the last caller released it.
 */
export async function openAccountDatabase(accountId: string): Promise<OpenAccountDatabaseResult> {
    const existing = openDatabases.get(accountId);
    if (existing) {
        existing.refs += 1;
        return withRelease(accountId, await existing.promise);
    }

    const entry: OpenEntry = { promise: openAndMigrate(accountId), refs: 1 };
    openDatabases.set(accountId, entry);

    let opened: OpenedDatabase;
    try {
        opened = await entry.promise;
    } catch (error) {
        // A failed open must not be cached, otherwise every later call would fail the same way.
        if (openDatabases.get(accountId) === entry) openDatabases.delete(accountId);
        throw error;
    }
    return withRelease(accountId, opened);
}

/** expo-sqlite reports a missing file as "Database '<name>' not found" on Android and iOS. */
function isDatabaseNotFoundError(error: unknown): boolean {
    return error instanceof Error && /not found/i.test(error.message);
}

/**
 * Closes and deletes the database file of an account. Idempotent: deleting a database that does
 * not exist is not an error. This is the building block for `onAccountRemoved`.
 */
export async function deleteAccountDatabase(accountId: string): Promise<void> {
    const name = databaseName(accountId);

    const entry = openDatabases.get(accountId);
    if (entry) {
        openDatabases.delete(accountId);
        // The open may still be in flight; wait for it so the file is not deleted underneath it.
        const opened = await entry.promise.catch(() => null);
        if (opened) await opened.close();
    }

    const SQLite = await import('expo-sqlite');
    try {
        await SQLite.deleteDatabaseAsync(name);
    } catch (error) {
        if (!isDatabaseNotFoundError(error)) throw error;
    }
}
