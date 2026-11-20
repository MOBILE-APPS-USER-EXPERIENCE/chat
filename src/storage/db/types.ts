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