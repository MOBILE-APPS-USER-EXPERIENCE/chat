import type { AccountStorage } from '../../ports';

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
    });
}
