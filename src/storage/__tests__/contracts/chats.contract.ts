import type { AccountStorage } from '../../ports';
import { ChatSnapshot } from '../../types';

export function chatRepositoryContract(name: string, make: () => Promise<AccountStorage>) {
    describe(`ChatRepository (${name})`, () => {
        let storage: AccountStorage;
        const snapshot = (id: number, joined = true) => ({
            id, name: `Chat ${id}`, visibility: 'private' as const, directchat: false,
            role: 'member' as const, joined, ownerUserid: 'owner', members: [{ userid: `u${id}`, role: 'member' as const }],
        });

        beforeEach(async () => {
            storage = await make();
        });

        it('applies snapshots, preserves local fields, replaces members, and marks omitted chats missing', async () => {
            await storage.chats.applySnapshot([snapshot(2), snapshot(1)], 100);
            await storage.messages.appendBatch(1, [{
                id: 8, userid: 'u', userNick: null, userFullname: null, userHash: null,
                serverTime: null, important: false, text: 'old', photoId: null, fileId: null, position: null,
            }], 110);
            await storage.chats.applySnapshot([{ ...snapshot(1), name: 'Updated', members: [{ userid: 'new', role: 'owner' }] }], 200);
            const chat = await storage.chats.get(1);
            expect(chat).toMatchObject({ name: 'Updated', firstSeenAt: 100, polledUpTo: 8, lastPolledAt: 110, syncedAt: 200, missingSince: null });
            expect(await storage.chats.listMembers(1)).toEqual([{ userid: 'new', role: 'owner' }]);
            expect((await storage.chats.get(2))?.missingSince).toBe(200);
            await storage.chats.applySnapshot([], 300);
            expect((await storage.chats.get(2))?.missingSince).toBe(200);
            expect(await storage.messages.get(1, 8)).not.toBeNull();
        });

        it('lists joined chats by ascending id and returns null for unknown chats', async () => {
            await storage.chats.applySnapshot([snapshot(3), snapshot(1), snapshot(2, false)], 100);
            expect((await storage.chats.list()).map(chat => chat.id)).toEqual([1, 2, 3]);
            expect((await storage.chats.list({ joined: true })).map(chat => chat.id)).toEqual([1, 3]);
            expect(await storage.chats.get(99)).toBeNull();
        });

        it('purges a chat and cascades members and messages without affecting others', async () => {
            await storage.chats.applySnapshot([snapshot(1), snapshot(2)], 100);
            await storage.messages.appendBatch(1, [{ id: 1, userid: 'u', userNick: null, userFullname: null, userHash: null, serverTime: null, important: false, text: null, photoId: null, fileId: null, position: null }], 101);
            await storage.messages.appendBatch(2, [{ id: 2, userid: 'u', userNick: null, userFullname: null, userHash: null, serverTime: null, important: false, text: null, photoId: null, fileId: null, position: null }], 101);
            await storage.chats.purge(1);
            await storage.chats.purge(99);
            expect(await storage.chats.get(1)).toBeNull();
            expect(await storage.chats.listMembers(1)).toEqual([]);
            expect(await storage.messages.get(1, 1)).toBeNull();
            expect(await storage.chats.get(2)).not.toBeNull();
            expect(await storage.messages.get(2, 2)).not.toBeNull();
        });

        it('returns copies and isolates stored state from caller mutations', async () => {
            const input: ChatSnapshot = snapshot(1);
            await storage.chats.applySnapshot([input], 100);
            input.name = 'mutated input';
            input.members.push({ userid: 'late', role: 'member' });

            const chat = await storage.chats.get(1);
            const [listed] = await storage.chats.list();
            const members = await storage.chats.listMembers(1);
            const [member] = members;
            if (!chat || !listed || !member) throw new Error('expected stored chat data');
            chat.name = 'mutated get';
            chat.polledUpTo = 99;
            listed.name = 'mutated list';
            member.role = 'owner';
            members.push({ userid: 'extra', role: 'member' });

            expect(await storage.chats.get(1)).toMatchObject({ name: 'Chat 1', polledUpTo: 0 });
            expect((await storage.chats.list())[0]).toMatchObject({ name: 'Chat 1' });
            expect(await storage.chats.listMembers(1)).toEqual([{ userid: 'u1', role: 'member' }]);
        });

        it('lets the last duplicate chat id and the last duplicate member userid win', async () => {
            await storage.chats.applySnapshot([
                { ...snapshot(1), name: 'First' },
                {
                    ...snapshot(1), name: 'Second',
                    members: [{ userid: 'u1', role: 'member' }, { userid: 'u1', role: 'owner' }],
                },
            ], 100);
            expect(await storage.chats.get(1)).toMatchObject({ name: 'Second' });
            expect(await storage.chats.listMembers(1)).toEqual([{ userid: 'u1', role: 'owner' }]);
        });

        it('orders members by userid ascending with plain code-unit comparison', async () => {
            await storage.chats.applySnapshot([{
                ...snapshot(1),
                members: [
                    { userid: 'b', role: 'member' },
                    { userid: 'a', role: 'member' },
                    { userid: 'Z', role: 'member' },
                    { userid: 'A', role: 'member' },
                ],
            }], 100);
            expect((await storage.chats.listMembers(1)).map(member => member.userid)).toEqual(['A', 'Z', 'a', 'b']);
        });

        it('keeps stored messages when a snapshot is re-applied', async () => {
            await storage.chats.applySnapshot([snapshot(1)], 100);
            await storage.messages.appendBatch(1, [{
                id: 1, userid: 'u', userNick: null, userFullname: null, userHash: null,
                serverTime: null, important: false, text: 'kept', photoId: null, fileId: null, position: null,
            }], 110);
            await storage.chats.applySnapshot([{ ...snapshot(1), name: 'Re-applied' }], 200);
            expect((await storage.messages.get(1, 1))?.text).toBe('kept');
            expect((await storage.chats.get(1))?.polledUpTo).toBe(1);
        });

        it('accepts an empty snapshot on an empty database', async () => {
            await storage.chats.applySnapshot([], 100);
            expect(await storage.chats.list()).toEqual([]);
        });
    });
}
