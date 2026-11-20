/**
 * Shared setup for the SQLite repository tests: a fresh in-memory better-sqlite3 database,
 * migrated with the real migration files and with foreign keys on, exactly like the app opens
 * it (see `openDatabase.ts`). Not a test file on purpose: `testMatch` only picks `*.test.ts`.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import * as schema from '../db/schema';
import type { SqliteDb } from '../db/types';

export const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'db', 'migrations');

export type TestDatabase = {
    db: SqliteDb;
    /** Raw connection, for PRAGMA checks and direct SQL in tests. */
    raw: Database.Database;
    close(): void;
};

export function openTestDatabase(): TestDatabase {
    const raw = new Database(':memory:');
    raw.pragma('foreign_keys = ON');
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return {
        db,
        raw,
        close: () => raw.close(),
    };
}
