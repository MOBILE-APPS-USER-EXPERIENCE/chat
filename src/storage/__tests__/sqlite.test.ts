/** @jest-environment node */

import type { AccountStorage } from '../ports';
import { createSqliteAccountStorage } from '../db/sqliteAccountStorage';
import { chatRepositoryContract } from './contracts/chats.contract';
import { messageRepositoryContract } from './contracts/messages.contract';
import { profileRepositoryContract } from './contracts/profiles.contract';
import { openTestDatabase, type TestDatabase } from './sqliteTestDb';

// The contracts never close what `make` returns; the runner owns the cleanup.
const openStorages: AccountStorage[] = [];
const databases: TestDatabase[] = [];

afterEach(async () => {
    await Promise.all(openStorages.splice(0).map(storage => storage.close()));
    for (const database of databases.splice(0)) database.close();
});

const makeStorage = async (): Promise<AccountStorage> => {
    const database = openTestDatabase();
    databases.push(database);
    const storage = createSqliteAccountStorage(database.db, async () => database.close());
    openStorages.push(storage);
    return storage;
};

chatRepositoryContract('sqlite', makeStorage);
messageRepositoryContract('sqlite', makeStorage);
profileRepositoryContract('sqlite', makeStorage);

describe('SQLite-specific repository behavior', () => {
    const snapshot = (id: number) => ({
        id, name: `Chat ${id}`, visibility: 'private' as const, directchat: false,
        role: 'member' as const, joined: true, ownerUserid: 'owner',
        members: [{ userid: `u${id}`, role: 'member' as const }],
    });
    const msg = (id: number, text = `m${id}`) => ({
        id, userid: 'abcdit01', userNick: 'A', userFullname: null, userHash: null,
        serverTime: '2026-11-17_10-00-00', important: false, text,
        photoId: null, fileId: null, position: null,
    });

    it('enables foreign keys on the connection the repositories use', async () => {
        const database = openTestDatabase();
        databases.push(database);
        const row = database.raw.pragma('foreign_keys', { simple: true });
        expect(row).toBe(1);
        database.close();
    });

    it('keeps messages and the cursor when a snapshot is re-applied', async () => {
        const storage = await makeStorage();
        await storage.chats.applySnapshot([snapshot(1), snapshot(2)], 100);
        await storage.messages.appendBatch(1, [msg(1), msg(2)], 110);
        await storage.chats.applySnapshot([{ ...snapshot(1), name: 'Updated', members: [{ userid: 'new', role: 'owner' }] }], 200);
        expect((await storage.messages.get(1, 1))?.text).toBe('m1');
        expect((await storage.messages.get(1, 2))?.text).toBe('m2');
        expect((await storage.chats.get(1))?.polledUpTo).toBe(2);
        expect((await storage.chats.get(1))?.lastPolledAt).toBe(110);
        expect((await storage.chats.get(1))?.firstSeenAt).toBe(100);
        expect(await storage.chats.listMembers(1)).toEqual([{ userid: 'new', role: 'owner' }]);
    });

    it('inserts a 5000-message batch in one call and counts every row', async () => {
        const storage = await makeStorage();
        await storage.chats.applySnapshot([snapshot(1)], 100);
        const batch = Array.from({ length: 5000 }, (_, index) => msg(index + 1));
        const result = await storage.messages.appendBatch(1, batch, 200);
        expect(result).toEqual({ inserted: 5000, polledUpTo: 5000 });
        expect(await storage.messages.countAfter(1, 0)).toBe(5000);
        // The identical batch inserts nothing the second time.
        expect(await storage.messages.appendBatch(1, batch, 300)).toEqual({ inserted: 0, polledUpTo: 5000 });
    });

    it('leaves messages and the cursor unchanged when appendBatch fails', async () => {
        const storage = await makeStorage();
        await storage.chats.applySnapshot([snapshot(1)], 100);
        await storage.messages.appendBatch(1, [msg(1)], 110);
        await expect(storage.messages.appendBatch(99, [msg(5)], 200)).rejects.toThrow();
        expect(await storage.messages.get(1, 1)).not.toBeNull();
        expect((await storage.chats.get(1))?.polledUpTo).toBe(1);
        expect((await storage.chats.get(1))?.lastPolledAt).toBe(110);
    });

    it('leaves all profiles unchanged when applyDirectory fails', async () => {
        const storage = await makeStorage();
        await storage.profiles.applyDirectory([
            { userid: 'a', hash: 'ha', nickname: null, fullname: null },
        ], 100);
        await expect(storage.profiles.applyDirectory([
            { userid: 'b', hash: 'hb', nickname: null, fullname: null },
            { userid: 'c', hash: 'hb', nickname: null, fullname: null },
        ], 200)).rejects.toThrow();
        expect(await storage.profiles.get('a')).toMatchObject({ hash: 'ha', fetchedAt: 100, missingSince: null });
        expect(await storage.profiles.get('b')).toBeNull();
        expect(await storage.profiles.get('c')).toBeNull();
    });

    it('stores and returns messages whose userid has no profile', async () => {
        const storage = await makeStorage();
        await storage.chats.applySnapshot([snapshot(1)], 100);
        await storage.messages.appendBatch(1, [msg(1)], 110);
        expect((await storage.messages.get(1, 1))?.userid).toBe('abcdit01');
        expect(await storage.profiles.get('abcdit01')).toBeNull();
    });

    it('stays consistent when two repositories interleave on one connection', async () => {
        const storage = await makeStorage();
        await storage.chats.applySnapshot([snapshot(1), snapshot(2)], 100);
        await Promise.all([
            storage.messages.appendBatch(1, [msg(1), msg(2)], 110),
            storage.messages.appendBatch(2, [msg(1), msg(2)], 110),
            storage.profiles.applyDirectory([{ userid: 'p', hash: 'hp', nickname: null, fullname: null }], 110),
            storage.chats.applySnapshot([{ ...snapshot(1), name: 'Renamed' }], 120),
        ]);
        expect((await storage.messages.get(1, 1))?.text).toBe('m1');
        expect((await storage.messages.get(2, 2))?.text).toBe('m2');
        expect((await storage.chats.get(1))?.name).toBe('Renamed');
        expect((await storage.chats.get(1))?.polledUpTo).toBe(2);
        expect(await storage.profiles.get('p')).not.toBeNull();
    });
});
