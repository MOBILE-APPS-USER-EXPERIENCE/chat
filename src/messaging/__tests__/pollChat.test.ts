/** @jest-environment node */

import { MemoryAccountStorageFactory } from '../../storage/memory';
import { pollChat } from '../pollChat';
import { FakeSyncApi, msg, snap } from './fakes';

async function setup(chats = [snap(1)]) {
    const storage = await new MemoryAccountStorageFactory().open('test');
    await storage.chats.applySnapshot(chats, 100);
    const api = new FakeSyncApi();
    const clock = { time: 500 };
    const flags = { current: true };
    const deps = {
        api, chats: storage.chats, messages: storage.messages,
        now: () => clock.time, isCurrent: () => flags.current,
    };
    return { storage, api, clock, flags, deps };
}

const ids = async (storage: Awaited<ReturnType<typeof setup>>['storage'], chatId = 1) =>
    (await storage.messages.listPage(chatId, { limit: 100 })).map(message => message.id);

describe('pollChat', () => {
    it('polls from id 0 on the first poll and stores everything', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 3 });
        expect(t.api.calls).toEqual([{ method: 'getMessages', chatId: 1, fromId: 0 }]);
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 3, lastPolledAt: 500 });
    });

    it('polls incrementally from cursor - 1, ignores the overlap message and inserts only new ones', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1), msg(2), msg(3), msg(4), msg(5)]);
        t.clock.time = 900;
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 2 });
        expect(t.api.calls[1]).toEqual({ method: 'getMessages', chatId: 1, fromId: 2 });
        expect(await ids(t.storage)).toEqual([5, 4, 3, 2, 1]);
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 5, lastPolledAt: 900 });
    });

    it('keeps local data and only updates the poll time when the result is empty', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1), msg(2)]);   // message 3 is gone on the server (deleteuser)
        t.clock.time = 900;
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 0 });
        expect(await ids(t.storage)).toEqual([3, 2, 1]);
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 3, lastPolledAt: 900 });
    });

    it('rebuilds the chat from id 0 when the overlap message differs, and sets polledUpTo correctly', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1, 'old1'), msg(2, 'old2'), msg(3, 'old3')]);
        await pollChat(1, t.deps);
        // Recreated chat that reuses the id.
        t.api.messages.set(1, [msg(1, 'n1'), msg(2, 'n2'), msg(3, 'n3'), msg(4, 'n4')]);
        t.clock.time = 900;
        expect(await pollChat(1, t.deps)).toEqual({ status: 'reset', inserted: 4 });
        expect(t.api.calls.slice(1)).toEqual([
            { method: 'getMessages', chatId: 1, fromId: 2 },
            { method: 'getMessages', chatId: 1, fromId: 0 },
        ]);
        expect((await t.storage.messages.get(1, 1))?.text).toBe('n1');
        expect((await t.storage.messages.get(1, 3))?.text).toBe('n3');
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 4, lastPolledAt: 900 });
    });

    it('does not reset when only usernick, userfullname or userhash differ', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2)]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1), { ...msg(2), userNick: 'Renamed', userHash: 'other', userFullname: 'New Name' }]);
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 0 });
        expect((await t.storage.messages.get(1, 2))?.userNick).toBe('A');
    });

    it('does not reset when only sentAt differs in the overlap', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2)]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [
            msg(1),
            { ...msg(2), sentAt: Date.UTC(2026, 10, 17, 10, 0, 0) },
        ]);
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 0 });
        expect((await t.storage.messages.get(1, 2))?.sentAt).not.toBeNull();
    });

    it('keeps local data and appends when the cursor message is missing and the first id is greater', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1), msg(2), msg(4), msg(5)]);   // 3 was deleted on the server
        expect(await pollChat(1, t.deps)).toEqual({ status: 'ok', inserted: 2 });
        expect(await ids(t.storage)).toEqual([5, 4, 3, 2, 1]);
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 5 });
        expect(t.api.callsOf('getMessages')).toHaveLength(2);   // no re-fetch from 0
    });

    it('reports chat_not_found without changing or deleting anything', async () => {
        const t = await setup();
        expect(await pollChat(1, t.deps)).toEqual({ status: 'chat_not_found' });
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 0, lastPolledAt: null });
    });

    it('skips an unknown chat and a chat that is not joined without a request', async () => {
        const t = await setup([snap(1), snap(2, { joined: false })]);
        expect(await pollChat(99, t.deps)).toEqual({ status: 'skipped' });
        expect(await pollChat(2, t.deps)).toEqual({ status: 'skipped' });
        expect(t.api.calls).toEqual([]);
    });

    it('changes nothing when getMessages fails', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2)]);
        await pollChat(1, t.deps);
        t.api.failWith('getMessages', new Error('boom'));
        t.clock.time = 900;
        await expect(pollChat(1, t.deps)).rejects.toThrow('boom');
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 2, lastPolledAt: 500 });
        expect(await ids(t.storage)).toEqual([2, 1]);
    });

    it('keeps the old local copy when the re-fetch from 0 fails during a rebuild', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1, 'old1'), msg(2, 'old2'), msg(3, 'old3')]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1, 'n1'), msg(2, 'n2'), msg(3, 'n3')]);
        t.api.failWith('getMessages', new Error('refetch failed'), { fromId: 0 });
        await expect(pollChat(1, t.deps)).rejects.toThrow('refetch failed');
        expect((await t.storage.messages.get(1, 1))?.text).toBe('old1');
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 3 });
    });

    it('aborts without writing when isCurrent turns false during the request', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1), msg(2)]);
        t.api.onCall = () => { t.flags.current = false; };
        expect(await pollChat(1, t.deps)).toEqual({ status: 'aborted' });
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 0, lastPolledAt: null });
        expect(await ids(t.storage)).toEqual([]);
    });

    it('aborts before resetting when isCurrent turns false during the re-fetch', async () => {
        const t = await setup();
        t.api.messages.set(1, [msg(1, 'old1'), msg(2, 'old2')]);
        await pollChat(1, t.deps);
        t.api.messages.set(1, [msg(1, 'n1'), msg(2, 'n2')]);
        t.api.onCall = (call) => { if (call.fromId === 0) t.flags.current = false; };
        expect(await pollChat(1, t.deps)).toEqual({ status: 'aborted' });
        expect((await t.storage.messages.get(1, 1))?.text).toBe('old1');
        expect(await t.storage.chats.get(1)).toMatchObject({ polledUpTo: 2 });
    });
});
