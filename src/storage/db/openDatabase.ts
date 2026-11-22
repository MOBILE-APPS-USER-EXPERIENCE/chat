import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from './migrations/migrations';
import * as schema from './schema';
import { createSharedOpener } from './sharedOpen';
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

const opener = createSharedOpener<OpenedDatabase>(openAndMigrate, opened => opened.close());

/**
 * Opens (and migrates) the database for an account. Concurrent calls for the same id share one
 * open; the returned `close` only closes the connection when the last caller released it.
 */
export async function openAccountDatabase(accountId: string): Promise<OpenAccountDatabaseResult> {
    const handle = await opener.acquire(accountId);
    return { db: handle.value.db, close: () => handle.release() };
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
    await opener.destroy(accountId);

    const SQLite = await import('expo-sqlite');
    try {
        await SQLite.deleteDatabaseAsync(name);
    } catch (error) {
        if (!isDatabaseNotFoundError(error)) throw error;
    }
}
