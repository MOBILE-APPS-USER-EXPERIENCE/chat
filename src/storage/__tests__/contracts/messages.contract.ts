import type { AccountStorage } from '../../ports';
import type { RawMessageInput } from '../../types';

export function messageRepositoryContract(name: string, make: () => Promise<AccountStorage>) {
    describe(`MessageRepository (${name})`, () => {
        let storage: AccountStorage;
        const msg = (id: number, text = `m${id}`): RawMessageInput => ({
            id, userid: 'abcdit01', userNick: 'A', userFullname: null, userHash: null,
            serverTime: '2026-11-17_10-00-00', sentAt: Date.UTC(2026, 10, 17, 9, 0, 0), important: false, text,
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

        it('returns copies and isolates stored state from caller mutations', async () => {
            const input = msg(1);
            await storage.messages.appendBatch(3, [input], 2000);
            input.text = 'mutated input';
            const fetched = await storage.messages.get(3, 1);
            const [paged] = await storage.messages.listPage(3, { limit: 10 });
            if (!fetched || !paged) throw new Error('expected a stored message');
            fetched.text = 'mutated get';
            paged.text = 'mutated page';
            expect((await storage.messages.get(3, 1))?.text).toBe('m1');
            expect((await storage.messages.listPage(3, { limit: 10 }))[0]?.text).toBe('m1');
        });

        it('rejects a non-positive or non-integer limit with a RangeError', async () => {
            await storage.messages.appendBatch(3, [msg(1), msg(2), msg(3)], 2000);
            await expect(storage.messages.listPage(3, { limit: 0 })).rejects.toThrow(RangeError);
            await expect(storage.messages.listPage(3, { limit: -1 })).rejects.toThrow(RangeError);
            await expect(storage.messages.listPage(3, { limit: 1.5 })).rejects.toThrow(RangeError);
            // A valid call still works after the rejections.
            expect((await storage.messages.listPage(3, { limit: 2 })).map(message => message.id)).toEqual([3, 2]);
        });

        it('treats beforeId as exclusive and returns an empty page for unknown chats', async () => {
            await storage.messages.appendBatch(3, [msg(1), msg(2), msg(3)], 2000);
            expect((await storage.messages.listPage(3, { beforeId: 3, limit: 10 })).map(message => message.id)).toEqual([2, 1]);
            expect(await storage.messages.listPage(99, { limit: 10 })).toEqual([]);
            expect(await storage.messages.countAfter(99, 0)).toBe(0);
        });

        it('rejects an empty batch for an unknown chat and changes nothing', async () => {
            await expect(storage.messages.appendBatch(99, [], 2000)).rejects.toThrow();
            expect((await storage.chats.get(3))?.lastPolledAt).toBeNull();
        });

        it('counts duplicate ids in one batch once, first wins', async () => {
            const result = await storage.messages.appendBatch(3, [msg(1, 'first'), msg(1, 'second'), msg(1, 'third')], 2000);
            expect(result).toEqual({ inserted: 1, polledUpTo: 1 });
            expect((await storage.messages.get(3, 1))?.text).toBe('first');
        });

        it('ignores resetChat for an unknown chat', async () => {
            await storage.messages.appendBatch(3, [msg(1)], 2000);
            await storage.messages.resetChat(99);
            expect(await storage.messages.get(3, 1)).not.toBeNull();
            expect((await storage.chats.get(3))?.polledUpTo).toBe(1);
        });

        it('round-trips text, flags, nullable fields, and large ids', async () => {
            const big = 'x'.repeat(100_000);
            const batch: RawMessageInput[] = [
                { ...msg(1), text: null },
                { ...msg(2), text: '' },
                { ...msg(3), text: 'äöü 🎉 中文' },
                { ...msg(4), text: big },
                { ...msg(5), important: true, userNick: null, userFullname: 'Full Name', userHash: 'h', serverTime: null, photoId: 'p', fileId: 'f', position: '7' },
                { ...msg(2_000_000_000), text: 'max id' },
            ];
            await storage.messages.appendBatch(3, batch, 2000);
            const stored = await Promise.all(batch.map(message => storage.messages.get(3, message.id)));
            expect(stored.map(message => message?.text)).toEqual([null, '', 'äöü 🎉 中文', big, 'm5', 'max id']);
            expect(stored.map(message => message?.important)).toEqual([false, false, false, false, true, false]);
            expect(stored[4]).toMatchObject({ userNick: null, userFullname: 'Full Name', userHash: 'h', serverTime: null, photoId: 'p', fileId: 'f', position: '7' });
            expect(stored[5]).toMatchObject({ id: 2_000_000_000, chatId: 3 });
        });

        it('round-trips sentAt including null', async () => {
            await storage.messages.appendBatch(3, [
                { ...msg(1), sentAt: 123456789 },
                { ...msg(2), sentAt: null },
            ], 2000);
            expect((await storage.messages.get(3, 1))?.sentAt).toBe(123456789);
            expect((await storage.messages.get(3, 2))?.sentAt).toBeNull();
        });
    });
}
