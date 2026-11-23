/** @jest-environment node */

import { openTestDatabase } from '../../storage/__tests__/sqliteTestDb';
import { createSqliteAccountStorage } from '../../storage/db/sqliteAccountStorage';
import { MemoryAccountStorageFactory } from '../../storage/memory';
import type { AccountStorage } from '../../storage/ports';
import { InvalidTokenError } from '../errors';
import type { CycleDetails, CycleResult, SyncConfig } from '../ports';
import { DEFAULT_SYNC_CONFIG } from '../ports';
import { SyncService } from '../syncService';
import { FakeNetworkError, FakeSyncApi, flush, isFakeNetworkError, msg, profile, snap } from './fakes';

const opened: AccountStorage[] = [];

afterEach(async () => {
    await Promise.all(opened.splice(0).map(storage => storage.close()));
});

type MakeStorage = () => Promise<AccountStorage>;

const backends: [string, MakeStorage][] = [
    ['memory', async () => {
        const storage = await new MemoryAccountStorageFactory().open('sync');
        opened.push(storage);
        return storage;
    }],
    ['sqlite', async () => {
        const database = openTestDatabase();
        const storage = createSqliteAccountStorage(database.db, async () => database.close());
        opened.push(storage);
        return storage;
    }],
];

const CONFIG: SyncConfig = { profilesIntervalMs: 600_000, missingCheckIntervalMs: 60_000, otherChatsIntervalMs: 30_000 };

async function harness(makeStorage: MakeStorage, config: Partial<SyncConfig> = {}) {
    const storage = await makeStorage();
    const api = new FakeSyncApi();
    const state = { time: 1_000, current: true };
    const onInvalidToken = jest.fn();
    const service = new SyncService({
        api, storage,
        now: () => state.time,
        isCurrent: () => state.current,
        isNetworkError: isFakeNetworkError,
        onInvalidToken,
        config: { ...CONFIG, ...config },
    });
    return { storage, api, state, service, onInvalidToken };
}

function details(result: CycleResult): CycleDetails {
    if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
    return result;
}

async function capture(storage: AccountStorage) {
    const chats = (await storage.chats.list()).map(chat => ({ ...chat, syncedAt: 0, lastPolledAt: 0 }));
    const members: Record<number, unknown> = {};
    const messages: Record<number, unknown> = {};
    for (const chat of chats) {
        members[chat.id] = await storage.chats.listMembers(chat.id);
        messages[chat.id] = await storage.messages.listPage(chat.id, { limit: 100 });
    }
    const profiles = await Promise.all(['abcdit01', 'efghit02'].map(async userid => {
        const row = await storage.profiles.get(userid);
        return row === null ? null : { ...row, fetchedAt: 0 };
    }));
    return { chats, members, messages, profiles };
}

describe('SyncService defaults', () => {
    it('documents the default intervals: 10 min profiles, 60 s missing check, 30 s other chats', () => {
        expect(DEFAULT_SYNC_CONFIG).toEqual({ profilesIntervalMs: 600_000, missingCheckIntervalMs: 60_000, otherChatsIntervalMs: 30_000 });
    });
});

describe.each(backends)('SyncService (%s storage)', (_name, makeStorage) => {
    it('runs a full cycle: stores chats, members, profiles and messages, open chat first', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [
            snap(0, { visibility: 'public', ownerUserid: null }),
            snap(1, { ownerUserid: 'abcdit01', members: [{ userid: 'abcdit01', role: 'owner' }] }),
            snap(2, { joined: false }),
        ];
        h.api.profiles = [profile('abcdit01', 'h1')];
        h.api.messages.set(0, [msg(1), msg(2)]);
        h.api.messages.set(1, [msg(1, 'a')]);

        const result = await h.service.runCycle({ openChatId: 1 });

        expect(result).toEqual({
            status: 'ok', chats: 'updated', profiles: 'updated',
            polled: [
                { chatId: 1, result: { status: 'ok', inserted: 1 } },
                { chatId: 0, result: { status: 'ok', inserted: 2 } },
            ],
            purged: [], errors: [],
        });
        expect(h.api.calls.map(call => call.method)).toEqual(['getChats', 'getProfiles', 'getMessages', 'getMessages']);
        expect((await h.storage.chats.list()).map(chat => chat.id)).toEqual([0, 1, 2]);
        expect(await h.storage.chats.listMembers(1)).toEqual([{ userid: 'abcdit01', role: 'owner' }]);
        expect(await h.storage.profiles.get('abcdit01')).toMatchObject({ hash: 'h1', fetchedAt: 1_000 });
        expect((await h.storage.messages.get(1, 1))?.text).toBe('a');
        expect(await h.storage.chats.get(0)).toMatchObject({ polledUpTo: 2 });
    });

    it('does not apply a snapshot when getChats fails and still polls the known chats', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1, { name: 'Old' })], 500);
        h.api.chats = [snap(1, { name: 'New' })];
        h.api.messages.set(1, [msg(1)]);
        h.api.failWith('getChats', new Error('boom'));

        const result = details(await h.service.runCycle());

        expect(result.chats).toBe('failed');
        expect(result.errors).toEqual([{ chatId: null, message: 'boom' }]);
        expect(await h.storage.chats.get(1)).toMatchObject({ name: 'Old', syncedAt: 500 });
        expect(result.polled).toEqual([{ chatId: 1, result: { status: 'ok', inserted: 1 } }]);
    });

    it('reports a profile hash conflict and still polls messages', async () => {
        const h = await harness(makeStorage);
        await h.storage.profiles.applyDirectory([profile('a', 'h1')], 500);
        h.api.chats = [snap(1)];
        h.api.profiles = [profile('b', 'h1')];   // a different user claims the stored hash
        h.api.messages.set(1, [msg(1)]);

        const result = details(await h.service.runCycle({ openChatId: 1 }));

        expect(result.profiles).toBe('conflict');
        expect(result.errors).toEqual([]);
        expect(result.polled).toEqual([{ chatId: 1, result: { status: 'ok', inserted: 1 } }]);
        expect(await h.storage.profiles.get('a')).toMatchObject({ hash: 'h1', fetchedAt: 500 });
        expect(await h.storage.profiles.get('b')).toBeNull();
    });

    it('fetches profiles only when due', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, []);
        await h.service.runCycle();
        h.state.time += 1_000;
        const second = details(await h.service.runCycle());
        expect(second.profiles).toBe('skipped');
        expect(h.api.callsOf('getProfiles')).toHaveLength(1);
        h.state.time += 600_000;
        await h.service.runCycle();
        expect(h.api.callsOf('getProfiles')).toHaveLength(2);
    });

    it('polls the open chat every cycle and other chats at most once per interval', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1), snap(2)];
        h.api.messages.set(1, [msg(1)]);
        h.api.messages.set(2, [msg(1)]);

        await h.service.runCycle({ openChatId: 1 });
        expect([h.api.messageCalls(1).length, h.api.messageCalls(2).length]).toEqual([1, 1]);

        h.state.time += 10_000;
        await h.service.runCycle({ openChatId: 1 });
        expect([h.api.messageCalls(1).length, h.api.messageCalls(2).length]).toEqual([2, 1]);

        h.state.time += 20_000;   // 30 s after the first poll of chat 2
        await h.service.runCycle({ openChatId: 1 });
        expect([h.api.messageCalls(1).length, h.api.messageCalls(2).length]).toEqual([3, 2]);
    });

    it('does not poll an open chat that is not joined, or chats that are not joined', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1, { joined: false })];
        h.api.messages.set(1, [msg(1)]);
        const result = details(await h.service.runCycle({ openChatId: 1 }));
        expect(result.polled).toEqual([]);
        expect(h.api.callsOf('getMessages')).toEqual([]);
    });

    it('polls the other chats one request at a time, in ascending id order', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(3), snap(1), snap(2)];
        for (const id of [1, 2, 3]) h.api.messages.set(id, []);
        let inFlight = 0;
        let maxInFlight = 0;
        const inner = h.api.getMessages.bind(h.api);
        h.api.getMessages = async (chatId: number, fromId: number) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            try {
                // Span a macrotask so a concurrent service would be counted as overlapping.
                await flush();
                return await inner(chatId, fromId);
            } finally {
                inFlight -= 1;
            }
        };
        await h.service.runCycle();
        expect(h.api.callsOf('getMessages').map(call => call.chatId)).toEqual([1, 2, 3]);
        expect(maxInFlight).toBe(1);
    });

    it('purges a missing chat when getmessages confirms 458', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        await h.storage.messages.appendBatch(2, [msg(1)], 500);
        h.api.chats = [snap(1)];            // chat 2 is no longer listed
        h.api.messages.set(1, []);          // and does not exist on the server

        const result = details(await h.service.runCycle());

        expect(result.purged).toEqual([2]);
        expect(h.api.messageCalls(2)).toEqual([{ method: 'getMessages', chatId: 2, fromId: 1 }]);
        expect(await h.storage.chats.get(2)).toBeNull();
        expect(await h.storage.messages.get(2, 1)).toBeNull();
        expect(await h.storage.chats.get(1)).not.toBeNull();
    });

    it('does not purge a chat that is only missing from getchats but still exists on the server', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, []);
        h.api.messages.set(2, []);

        const result = details(await h.service.runCycle());

        expect(result.purged).toEqual([]);
        expect(await h.storage.chats.get(2)).toMatchObject({ missingSince: 1_000 });
    });

    it('does not purge a missing chat when the check fails with another error', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, []);
        h.api.failWith('getMessages', new Error('flaky'), { chatId: 2 });

        const result = details(await h.service.runCycle());

        expect(result.purged).toEqual([]);
        expect(result.errors).toEqual([{ chatId: 2, message: 'flaky' }]);
        expect(await h.storage.chats.get(2)).not.toBeNull();
    });

    it('checks a missing chat at most once per interval', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, []);
        h.api.messages.set(2, []);

        await h.service.runCycle();
        expect(h.api.messageCalls(2)).toHaveLength(1);
        h.state.time += 10_000;
        await h.service.runCycle();
        expect(h.api.messageCalls(2)).toHaveLength(1);
        h.state.time += 50_000;   // 60 s after the first check
        await h.service.runCycle();
        expect(h.api.messageCalls(2)).toHaveLength(2);
    });

    it('keeps a private chat the user left, with its messages', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        await h.storage.messages.appendBatch(2, [msg(1), msg(2)], 500);
        h.api.chats = [snap(1)];   // getchats stops listing the private chat after leaving
        h.api.messages.set(1, []);
        h.api.messages.set(2, [msg(1), msg(2)]);   // still readable

        await h.service.runCycle();
        h.state.time += 60_000;
        const second = details(await h.service.runCycle());

        expect(second.purged).toEqual([]);
        expect(h.api.messageCalls(2).map(call => call.fromId)).toEqual([2, 2]);
        expect(await h.storage.chats.get(2)).toMatchObject({ missingSince: 1_000, polledUpTo: 2 });
        expect(await h.storage.messages.get(2, 2)).not.toBeNull();
    });

    it('keeps a chat that answers 458 on a normal poll while getchats still lists it', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];   // no messages entry: the server says 458
        const result = details(await h.service.runCycle({ openChatId: 1 }));
        expect(result.polled).toEqual([{ chatId: 1, result: { status: 'chat_not_found' } }]);
        expect(result.purged).toEqual([]);
        expect(await h.storage.chats.get(1)).not.toBeNull();
    });

    it('stops the cycle on 456, calls onInvalidToken once and makes no further requests', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.failWith('getChats', new InvalidTokenError());
        expect(await h.service.runCycle()).toEqual({ status: 'invalid_token' });
        expect(h.onInvalidToken).toHaveBeenCalledTimes(1);
        expect(h.api.calls.map(call => call.method)).toEqual(['getChats']);
    });

    it('stops at the first chat that answers 456 and does not request the others', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1), snap(2)];
        h.api.messages.set(2, [msg(1)]);
        h.api.failWith('getMessages', new InvalidTokenError(), { chatId: 1 });
        expect(await h.service.runCycle({ openChatId: 1 })).toEqual({ status: 'invalid_token' });
        expect(h.onInvalidToken).toHaveBeenCalledTimes(1);
        expect(h.api.messageCalls(2)).toEqual([]);
    });

    it('returns offline on a network error without throwing, and writes nothing more', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.failWith('getChats', new FakeNetworkError());
        await expect(h.service.runCycle()).resolves.toEqual({ status: 'offline' });
        expect(await h.storage.chats.list()).toEqual([]);
        expect(h.onInvalidToken).not.toHaveBeenCalled();
    });

    it('returns offline when a poll hits a network error', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1), snap(2)];
        h.api.messages.set(2, []);
        h.api.failWith('getMessages', new FakeNetworkError(), { chatId: 1 });
        expect(await h.service.runCycle({ openChatId: 1 })).toEqual({ status: 'offline' });
        expect(h.api.messageCalls(2)).toEqual([]);
    });

    it('does not let one failing chat block the others', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1), snap(2)];
        h.api.messages.set(1, [msg(1)]);
        h.api.messages.set(2, [msg(1, 'two')]);
        h.api.failWith('getMessages', new Error('boom'), { chatId: 1 });

        const result = details(await h.service.runCycle({ openChatId: 1 }));

        expect(result.errors).toEqual([{ chatId: 1, message: 'boom' }]);
        expect(result.polled).toEqual([{ chatId: 2, result: { status: 'ok', inserted: 1 } }]);
        expect((await h.storage.messages.get(2, 1))?.text).toBe('two');
    });

    it('shares one run between overlapping runCycle calls', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, [msg(1)]);
        const release = h.api.holdMessages();

        const first = h.service.runCycle({ openChatId: 1 });
        const second = h.service.runCycle({ openChatId: 1 });
        expect(second).toBe(first);
        await flush();
        release();
        await first;

        expect(h.api.callsOf('getChats')).toHaveLength(1);
        const third = h.service.runCycle({ openChatId: 1 });
        expect(third).not.toBe(first);
        await third;
        expect(h.api.callsOf('getChats')).toHaveLength(2);
    });

    it('serializes polls of the same chat', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1)], 500);
        h.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        const release = h.api.holdMessages();

        const first = h.service.pollNow(1);
        const second = h.service.pollNow(1);
        await flush();
        expect(h.api.messageCalls(1)).toHaveLength(1);
        release();

        expect(await Promise.all([first, second])).toEqual([
            { status: 'ok', inserted: 3 }, { status: 'ok', inserted: 0 },
        ]);
        expect(h.api.messageCalls(1).map(call => call.fromId)).toEqual([0, 2]);
    });

    it('never interleaves an on-demand poll with a cycle poll of the same chat', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, [msg(1), msg(2), msg(3)]);
        const release = h.api.holdMessages();

        const cycle = h.service.runCycle({ openChatId: 1 });
        await flush();
        const poll = h.service.pollNow(1);
        await flush();
        expect(h.api.messageCalls(1)).toHaveLength(1);
        release();
        await Promise.all([cycle, poll]);

        expect(h.api.messageCalls(1).map(call => call.fromId)).toEqual([0, 2]);
    });

    it('pollNow polls only the requested chat', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1), snap(2)], 500);
        h.api.messages.set(1, [msg(1)]);
        h.api.messages.set(2, [msg(1)]);
        expect(await h.service.pollNow(2)).toEqual({ status: 'ok', inserted: 1 });
        expect(h.api.messageCalls(1)).toEqual([]);
    });

    it('pollNow rethrows 456 and calls onInvalidToken', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1)], 500);
        h.api.failWith('getMessages', new InvalidTokenError());
        await expect(h.service.pollNow(1)).rejects.toBeInstanceOf(InvalidTokenError);
        expect(h.onInvalidToken).toHaveBeenCalledTimes(1);
    });

    it('writes no snapshot when isCurrent turns false while getChats is in flight', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.onCall = () => { h.state.current = false; };
        expect(await h.service.runCycle()).toEqual({ status: 'aborted' });
        expect(await h.storage.chats.list()).toEqual([]);
        expect(h.api.calls.map(call => call.method)).toEqual(['getChats']);
    });

    it('writes no profiles when isCurrent turns false while getProfiles is in flight', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.profiles = [profile('a', 'h1')];
        h.api.onCall = (call) => { if (call.method === 'getProfiles') h.state.current = false; };
        expect(await h.service.runCycle({ openChatId: 1 })).toEqual({ status: 'aborted' });
        expect(await h.storage.profiles.get('a')).toBeNull();
        expect(h.api.callsOf('getMessages')).toEqual([]);
    });

    it('writes no messages when isCurrent turns false while getMessages is in flight', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, [msg(1), msg(2)]);
        h.api.onCall = (call) => { if (call.method === 'getMessages') h.state.current = false; };
        expect(await h.service.runCycle({ openChatId: 1 })).toEqual({ status: 'aborted' });
        expect(await h.storage.chats.get(1)).toMatchObject({ polledUpTo: 0, lastPolledAt: null });
        expect(await h.storage.messages.get(1, 1)).toBeNull();
    });

    it('discards a pollNow result when isCurrent turns false', async () => {
        const h = await harness(makeStorage);
        await h.storage.chats.applySnapshot([snap(1)], 500);
        h.api.messages.set(1, [msg(1)]);
        h.api.onCall = () => { h.state.current = false; };
        expect(await h.service.pollNow(1)).toEqual({ status: 'aborted' });
        expect(await h.storage.messages.get(1, 1)).toBeNull();
    });

    it('does not report an invalid token of a stale account', async () => {
        const h = await harness(makeStorage);
        h.api.failWith('getChats', new InvalidTokenError());
        h.api.onCall = () => { h.state.current = false; };
        expect(await h.service.runCycle()).toEqual({ status: 'aborted' });
        expect(h.onInvalidToken).not.toHaveBeenCalled();
    });

    it('dispose() lets an in-flight cycle finish without writing and blocks new work', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.messages.set(1, [msg(1)]);
        const release = h.api.holdMessages();

        const cycle = h.service.runCycle({ openChatId: 1 });
        await flush();
        h.service.dispose();
        release();

        expect(await cycle).toEqual({ status: 'aborted' });
        expect(await h.storage.chats.get(1)).toMatchObject({ polledUpTo: 0 });
        expect(await h.storage.messages.get(1, 1)).toBeNull();

        const requests = h.api.calls.length;
        expect(await h.service.runCycle()).toEqual({ status: 'aborted' });
        expect(await h.service.pollNow(1)).toEqual({ status: 'aborted' });
        expect(h.api.calls).toHaveLength(requests);
    });

    it('is idempotent: a second cycle against an unchanged server changes only syncedAt and lastPolledAt', async () => {
        const h = await harness(makeStorage, { profilesIntervalMs: 0, otherChatsIntervalMs: 0 });
        h.api.chats = [
            snap(0, { visibility: 'public', ownerUserid: null }),
            snap(1, { ownerUserid: 'abcdit01', members: [{ userid: 'abcdit01', role: 'owner' }, { userid: 'efghit02', role: 'invited' }] }),
        ];
        h.api.profiles = [profile('abcdit01', 'h1'), profile('efghit02', 'h2')];
        h.api.messages.set(0, [msg(1), msg(2)]);
        h.api.messages.set(1, [msg(1), msg(2), msg(3)]);

        await h.service.runCycle({ openChatId: 1 });
        const before = await capture(h.storage);
        const syncedBefore = (await h.storage.chats.get(1))?.syncedAt;

        h.state.time += 5_000;
        const second = details(await h.service.runCycle({ openChatId: 1 }));

        expect(second.polled.every(entry => entry.result.status === 'ok' && entry.result.inserted === 0)).toBe(true);
        expect(await capture(h.storage)).toEqual(before);
        expect((await h.storage.chats.get(1))?.syncedAt).toBe((syncedBefore ?? 0) + 5_000);
        expect((await h.storage.chats.get(1))?.lastPolledAt).toBe(6_000);
    });

    it('refreshChats waits for a held cycle then fetches again instead of using a stale snapshot', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1, { name: 'Stale' })];
        const release = h.api.holdChats();
        const cycle = h.service.runCycle();
        await flush();

        h.api.chats = [snap(1, { name: 'Newer' })];
        const refresh = h.service.refreshChats();
        await flush();
        expect(h.api.callsOf('getChats')).toHaveLength(1);

        release();
        await cycle;
        expect(await refresh).toBe('updated');
        expect((await h.storage.chats.get(1))?.name).toBe('Newer');
        expect(h.api.callsOf('getChats')).toHaveLength(2);
    });

    it('refreshChats 456 calls onInvalidToken once', async () => {
        const h = await harness(makeStorage);
        h.api.failWith('getChats', new InvalidTokenError());
        expect(await h.service.refreshChats()).toBe('invalid_token');
        expect(h.onInvalidToken).toHaveBeenCalledTimes(1);
    });

    it('refreshChats stale account does not write', async () => {
        const h = await harness(makeStorage);
        h.api.chats = [snap(1)];
        h.api.onCall = () => { h.state.current = false; };
        expect(await h.service.refreshChats()).toBe('aborted');
        expect(await h.storage.chats.list()).toEqual([]);
        expect(h.onInvalidToken).not.toHaveBeenCalled();
    });
});
