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
    });
}
