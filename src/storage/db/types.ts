import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type * as schema from './schema';

/**
 * The Drizzle handle for one account database. Repositories (step 5) take this type.
 *
 * It is the sync Expo SQLite driver: `expo-sqlite` exposes `prepareSync`/`executeSync` on web
 * too (the web build runs SQLite in a worker and blocks on `SharedArrayBuffer`), so one driver
 * covers iOS, Android and web.
 */
export type AccountDb = ExpoSQLiteDatabase<typeof schema>;

/**
 * Driver-agnostic sync database type for the repositories. Both the Expo driver (app) and the
 * better-sqlite3 driver (tests) produce a database assignable to this base type, so the
 * repository code needs no casts and no `any`. The first type argument is the execution mode
 * (`'sync'`: queries return results directly, not promises), the second the result shape.
 */
export type SqliteDb = BaseSQLiteDatabase<'sync', unknown, typeof schema>;