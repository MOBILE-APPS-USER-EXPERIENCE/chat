import type { ProfileRepository } from '../ports';
import type { ProfileRow } from '../types';
import { MemoryDb } from './memoryStorage';

export class MemoryProfileRepository implements ProfileRepository {
    constructor(private readonly db: MemoryDb) { }

    async get(userid: string) {
        const profile = this.db.profiles.get(userid);
        return profile ? { ...profile } : null;
    }

    async getByHash(hash: string) {
        const profile = [...this.db.profiles.values()].find(value => value.hash === hash);
        return profile ? { ...profile } : null;
    }

    async applyDirectory(profiles: Omit<ProfileRow, 'fetchedAt' | 'missingSince'>[], now: number) {
        const present = new Set<string>();
        for (const profile of profiles) {
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
