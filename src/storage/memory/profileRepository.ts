import type { ProfileRepository } from '../ports';
import type { ProfileRow } from '../types';
import { MemoryDb } from './memoryStorage';

export class MemoryProfileRepository implements ProfileRepository {
    constructor(private readonly db: MemoryDb) { }

    async list() {
        return [...this.db.profiles.values()]
            .sort((a, b) => a.userid < b.userid ? -1 : a.userid > b.userid ? 1 : 0)
            .map((profile) => ({ ...profile }));
    }

    async get(userid: string) {
        const profile = this.db.profiles.get(userid);
        return profile ? { ...profile } : null;
    }

    async getByHash(hash: string) {
        const profile = [...this.db.profiles.values()].find(value => value.hash === hash);
        return profile ? { ...profile } : null;
    }

    async applyDirectory(profiles: Omit<ProfileRow, 'fetchedAt' | 'missingSince'>[], now: number) {
        // Duplicate userids in one batch: the last one wins.
        const batch = new Map<string, Omit<ProfileRow, 'fetchedAt' | 'missingSince'>>();
        for (const profile of profiles) {
            batch.set(profile.userid, { ...profile });
        }

        // A hash must never belong to two different userids. All checks run before any mutation,
        // so a rejected batch changes nothing. A stored hash counts as released when its owner
        // also appears in the batch (with a different hash — equal claims fail the check above).
        const hashOwners = new Map<string, string>();
        for (const profile of batch.values()) {
            const owner = hashOwners.get(profile.hash);
            if (owner !== undefined && owner !== profile.userid) {
                throw new Error(`hash collision: ${profile.hash}`);
            }
            hashOwners.set(profile.hash, profile.userid);
        }
        for (const profile of batch.values()) {
            const stored = [...this.db.profiles.values()].find(p => p.hash === profile.hash);
            if (stored && stored.userid !== profile.userid && !batch.has(stored.userid)) {
                throw new Error(`hash collision: ${profile.hash}`);
            }
        }

        const present = new Set<string>();
        for (const profile of batch.values()) {
            present.add(profile.userid);
            this.db.profiles.set(profile.userid, {
                ...profile,
                fetchedAt: now,
                missingSince: null,
            });
        }
        for (const profile of this.db.profiles.values()) {
            if (!present.has(profile.userid) && profile.missingSince === null) {
                profile.missingSince = now;
            }
        }
    }
}
