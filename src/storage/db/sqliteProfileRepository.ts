import { and, eq, isNull } from 'drizzle-orm';

import type { ProfileRepository } from '../ports';
import type { ProfileRow } from '../types';
import { toProfileRow } from './mappers';
import { profiles } from './schema';
import type { SqliteDb } from './types';

/**
 * SQLite implementation of `ProfileRepository`. `profiles.hash` is `UNIQUE`, so a batch that
 * would move a hash to a second userid is rejected before anything is written.
 */
export class SqliteProfileRepository implements ProfileRepository {
    constructor(private readonly db: SqliteDb) { }

    async get(userid: string) {
        const row = this.db.select().from(profiles).where(eq(profiles.userid, userid)).get();
        return row ? toProfileRow(row) : null;
    }

    async getByHash(hash: string) {
        const row = this.db.select().from(profiles).where(eq(profiles.hash, hash)).get();
        return row ? toProfileRow(row) : null;
    }

    async applyDirectory(entries: Omit<ProfileRow, 'fetchedAt' | 'missingSince'>[], now: number) {
        // Duplicate userids in one batch: the last one wins.
        const batch = new Map<string, Omit<ProfileRow, 'fetchedAt' | 'missingSince'>>();
        for (const entry of entries) {
            batch.set(entry.userid, { ...entry });
        }

        this.db.transaction(tx => {
            // A hash must never belong to two different userids. All checks run before any
            // mutation, so a rejected batch changes nothing. A stored hash counts as released
            // when its owner also appears in the batch (with a different hash — equal claims
            // fail the check above).
            const hashOwners = new Map<string, string>();
            for (const entry of batch.values()) {
                const owner = hashOwners.get(entry.hash);
                if (owner !== undefined && owner !== entry.userid) {
                    throw new Error(`hash collision: ${entry.hash}`);
                }
                hashOwners.set(entry.hash, entry.userid);
            }
            for (const entry of batch.values()) {
                const stored = tx.select().from(profiles).where(eq(profiles.hash, entry.hash)).get();
                if (stored && stored.userid !== entry.userid && !batch.has(stored.userid)) {
                    throw new Error(`hash collision: ${entry.hash}`);
                }
            }

            for (const entry of batch.values()) {
                tx.insert(profiles)
                    .values({
                        userid: entry.userid,
                        hash: entry.hash,
                        nickname: entry.nickname,
                        fullname: entry.fullname,
                        fetchedAt: now,
                        missingSince: null,
                    })
                    .onConflictDoUpdate({
                        target: profiles.userid,
                        set: {
                            hash: entry.hash,
                            nickname: entry.nickname,
                            fullname: entry.fullname,
                            fetchedAt: now,
                            missingSince: null,
                        },
                    })
                    .run();
            }

            // Mark stored profiles that the directory omits as missing.
            const present = new Set(batch.keys());
            const storedUserids = tx.select({ userid: profiles.userid }).from(profiles).all().map(row => row.userid);
            const missing = storedUserids.filter(userid => !present.has(userid));
            for (const userid of missing) {
                tx.update(profiles)
                    .set({ missingSince: now })
                    .where(and(eq(profiles.userid, userid), isNull(profiles.missingSince)))
                    .run();
            }
        });
    }
}
