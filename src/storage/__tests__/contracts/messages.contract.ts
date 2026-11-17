import type { AccountStorage } from '../../ports';
import type { RawMessageInput } from '../../types';

export function messageRepositoryContract(name: string, make: () => Promise<AccountStorage>) {
    describe(`MessageRepository (${name})`, () => {
        let storage: AccountStorage;
        const msg = (id: number, text = `m${id}`): RawMessageInput => ({
            id, userid: 'abcdit01', userNick: 'A', userFullname: null, userHash: null,
            serverTime: '2026-11-17_10-00-00', important: false, text,
            photoId: null, fileId: null, position: null,
        });

        beforeEach(async () => {
            storage = await make();
            await storage.chats.applySnapshot([{
                id: 3, name: 'Team', visibility: 'private', directchat: false,
                role: 'member', joined: true, ownerUserid: 'efghit02', members: [],
            }], 1000);
        });

        it('inserts a batch once, ignores duplicates, and advances the cursor', async () => {
            expect(await storage.messages.appendBatch(3, [msg(1), msg(2), msg(2)], 2000)).toEqual({ inserted: 2, polledUpTo: 2 });
            expect(await storage.messages.appendBatch(3, [msg(1, 'changed')], 3000)).toEqual({ inserted: 0, polledUpTo: 2 });
            expect((await storage.messages.get(3, 1))?.text).toBe('m1');
            expect((await storage.chats.get(3))?.lastPolledAt).toBe(3000);
        });

        it('updates only the polling time for an empty batch', async () => {
            await storage.messages.appendBatch(3, [msg(5)], 2000);
            expect(await storage.messages.appendBatch(3, [], 3000)).toEqual({ inserted: 0, polledUpTo: 5 });
            expect((await storage.chats.get(3))?.lastPolledAt).toBe(3000);
        });

        it('never moves the cursor backwards and pages by id newest first', async () => {
            await storage.messages.appendBatch(3, [msg(1), msg(5), msg(3)], 2000);
            await storage.messages.appendBatch(3, [msg(2)], 3000);
            expect((await storage.chats.get(3))?.polledUpTo).toBe(5);
            expect((await storage.messages.listPage(3, { beforeId: 5, limit: 2 })).map(message => message.id)).toEqual([3, 2]);
            expect(await storage.messages.countAfter(3, 2)).toBe(2);
        });

        it('returns null for an unknown message and rejects an unknown chat atomically', async () => {
            expect(await storage.messages.get(3, 99)).toBeNull();
            await expect(storage.messages.appendBatch(99, [msg(1)], 2000)).rejects.toThrow();
            expect((await storage.chats.get(3))?.lastPolledAt).toBeNull();
        });

        it('resets one chat without deleting the chat or another chat', async () => {
            await storage.chats.applySnapshot([{ id: 4, name: 'Other', visibility: 'public', directchat: false, role: 'none', joined: false, ownerUserid: null, members: [] }], 1000);
            await storage.messages.appendBatch(3, [msg(1)], 2000);
            await storage.messages.appendBatch(4, [msg(2)], 2000);
            await storage.messages.resetChat(3);
            expect(await storage.messages.get(3, 1)).toBeNull();
            expect((await storage.chats.get(3))?.polledUpTo).toBe(0);
            expect(await storage.chats.get(3)).not.toBeNull();
            expect(await storage.messages.get(4, 2)).not.toBeNull();
        });
    });
}
