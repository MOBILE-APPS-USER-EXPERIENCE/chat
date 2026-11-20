import type { AccountStorage } from '../../ports';
import { ProfileRow } from '../../types';

export function profileRepositoryContract(name: string, make: () => Promise<AccountStorage>) {
    describe(`ProfileRepository (${name})`, () => {
        let storage: AccountStorage;
        const profile = (userid: string, hash: string) => ({ userid, hash, nickname: null, fullname: null });

        beforeEach(async () => {
            storage = await make();
        });

        it('upserts present profiles, marks omitted profiles missing, and never deletes', async () => {
            await storage.profiles.applyDirectory([profile('a', 'ha'), profile('b', 'hb')], 100);
            await storage.profiles.applyDirectory([profile('a', 'ha2')], 200);
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'ha2', fetchedAt: 200, missingSince: null });
            expect(await storage.profiles.get('b')).toMatchObject({ missingSince: 200 });
            await storage.profiles.applyDirectory([], 300);
            expect((await storage.profiles.get('b'))?.missingSince).toBe(200);
        });

        it('finds profiles by their unique hash', async () => {
            await storage.profiles.applyDirectory([profile('a', 'unique')], 100);
            expect(await storage.profiles.getByHash('unique')).toMatchObject({ userid: 'a' });
            expect(await storage.profiles.getByHash('unknown')).toBeNull();
        });

        it('returns copies and isolates stored state from caller mutations', async () => {
            const input: Omit<ProfileRow, 'fetchedAt' | 'missingSince'> = profile('a', 'ha');
            await storage.profiles.applyDirectory([input], 100);
            input.nickname = 'mutated input';
            const byId = await storage.profiles.get('a');
            const byHash = await storage.profiles.getByHash('ha');
            if (!byId || !byHash) throw new Error('expected a stored profile');
            byId.nickname = 'mutated get';
            byHash.nickname = 'mutated hash';
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'ha', nickname: null });
            expect(await storage.profiles.getByHash('ha')).toMatchObject({ nickname: null });
        });

        it('rejects a hash that would belong to two different userids and changes nothing', async () => {
            await storage.profiles.applyDirectory([profile('a', 'ha'), profile('b', 'hb')], 100);
            // Collision inside one batch.
            await expect(storage.profiles.applyDirectory([profile('c', 'hc'), profile('d', 'hc')], 200)).rejects.toThrow();
            // Collision against a stored row.
            await expect(storage.profiles.applyDirectory([profile('d', 'ha')], 200)).rejects.toThrow();
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'ha', fetchedAt: 100, missingSince: null });
            expect(await storage.profiles.get('b')).toMatchObject({ hash: 'hb', fetchedAt: 100, missingSince: null });
            expect(await storage.profiles.get('c')).toBeNull();
            expect(await storage.profiles.get('d')).toBeNull();
        });

        it('accepts a changed hash for the same userid and lets the last duplicate userid win', async () => {
            await storage.profiles.applyDirectory([profile('a', 'ha')], 100);
            await storage.profiles.applyDirectory([profile('a', 'ha2')], 200);
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'ha2', fetchedAt: 200, missingSince: null });
            expect(await storage.profiles.getByHash('ha')).toBeNull();

            await storage.profiles.applyDirectory([profile('a', 'h3'), profile('a', 'h4')], 300);
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'h4', fetchedAt: 300 });
        });

        it('allows a hash released by its owner within the same batch', async () => {
            await storage.profiles.applyDirectory([profile('a', 'ha')], 100);
            // 'a' gives up 'ha' in the same batch that 'd' claims it: the end state is consistent.
            await storage.profiles.applyDirectory([profile('a', 'h-new'), profile('d', 'ha')], 200);
            expect(await storage.profiles.get('a')).toMatchObject({ hash: 'h-new', fetchedAt: 200 });
            expect(await storage.profiles.get('d')).toMatchObject({ hash: 'ha', fetchedAt: 200 });
        });
    });
}
