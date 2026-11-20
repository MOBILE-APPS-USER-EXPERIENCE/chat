/** @jest-environment node */

import { AccountStorageManager } from '../accountStorageManager';
import { MemoryAccountStorageFactory } from '../memory';
import type { AccountStorage, AccountStorageFactory, KeyValueStore } from '../ports';
import type { StorageEnvironment } from '../storageEnvironment';

/**
 * All backends here are fakes: the manager is pure orchestration and must be provable without
 * touching `expo-sqlite` or the real KV store.
 */

function fakeStorage(tag: string): AccountStorage {
    return {
        // The repositories are never called in these tests; identity is all that matters.
        chats: null as never,
        profiles: null as never,
        messages: null as never,
        close: async () => undefined,
        ...({ tag } as Record<string, unknown>),
    } as AccountStorage;
}

function fakeFactory(options: {
    openTag?: string;
    failOpen?: boolean;
    failDestroy?: boolean;
} = {}): AccountStorageFactory & { opened: string[]; destroyed: string[] } {
    const opened: string[] = [];
    const destroyed: string[] = [];
    return {
        opened,
        destroyed,
        async open(accountId: string) {
            opened.push(accountId);
            if (options.failOpen) throw new Error('open failed');
            return fakeStorage(options.openTag ?? 'sqlite');
        },
        async destroy(accountId: string) {
            destroyed.push(accountId);
            if (options.failDestroy) throw new Error('destroy failed');
        },
    };
}

function fakeKv(): KeyValueStore & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>();
    return {
        data,
        async getJson<T>(key: string): Promise<T | null> {
            return data.has(key) ? (data.get(key) as T) : null;
        },
        async setJson<T>(key: string, value: T) {
            data.set(key, value);
        },
        async remove(key: string) {
            data.delete(key);
        },
    };
}

const nativeEnv = (): StorageEnvironment => ({ kind: 'native' });
const webEnv = (caps: Partial<Extract<StorageEnvironment, { kind: 'web' }>> = {}): StorageEnvironment => ({
    kind: 'web',
    crossOriginIsolated: true,
    isSecureContext: true,
    hasSharedArrayBuffer: true,
    hasOpfs: true,
    ...caps,
});

function makeManager(options: {
    environment: () => StorageEnvironment;
    sqlite?: AccountStorageFactory;
    memory?: AccountStorageFactory;
    kv?: KeyValueStore;
    loadCalls?: { count: number };
}) {
    const loadCalls = options.loadCalls ?? { count: 0 };
    const manager = new AccountStorageManager({
        environment: options.environment,
        loadSqlite: async () => {
            loadCalls.count++;
            return options.sqlite ?? fakeFactory();
        },
        memory: options.memory ?? fakeFactory({ openTag: 'memory' }),
        kv: options.kv ?? fakeKv(),
    });
    return { manager, loadCalls };
}

describe('AccountStorageManager', () => {
    it('uses sqlite on native and propagates open errors', async () => {
        const sqlite = fakeFactory({ failOpen: true });
        const { manager } = makeManager({ environment: nativeEnv, sqlite });
        await expect(manager.open('a')).rejects.toThrow('open failed');
        expect(manager.getStatus()).toEqual({ mode: 'sqlite' });
    });

    it('degrades to memory on web without isolation and never loads sqlite', async () => {
        const { manager, loadCalls } = makeManager({ environment: () => webEnv({ crossOriginIsolated: false }) });
        await manager.open('a');
        expect(manager.getStatus()).toMatchObject({ mode: 'memory', reason: 'no_isolation' });
        expect(loadCalls.count).toBe(0);
    });

    it('degrades to memory on web without a secure context', async () => {
        const { manager, loadCalls } = makeManager({ environment: () => webEnv({ isSecureContext: false }) });
        await manager.open('a');
        expect(manager.getStatus()).toMatchObject({ mode: 'memory', reason: 'no_secure_context' });
        expect(loadCalls.count).toBe(0);
    });

    it('degrades to memory on web without OPFS', async () => {
        const { manager, loadCalls } = makeManager({ environment: () => webEnv({ hasOpfs: false }) });
        await manager.open('a');
        expect(manager.getStatus()).toMatchObject({ mode: 'memory', reason: 'no_opfs' });
        expect(loadCalls.count).toBe(0);
    });

    it('uses sqlite on web when all capabilities are present', async () => {
        const sqlite = fakeFactory();
        const { manager } = makeManager({ environment: () => webEnv(), sqlite });
        await manager.open('a');
        expect(manager.getStatus()).toEqual({ mode: 'sqlite' });
        expect(sqlite.opened).toEqual(['a']);
    });

    it('falls back to memory with reason open_failed when the first web open fails', async () => {
        const sqlite = fakeFactory({ failOpen: true });
        const { manager } = makeManager({ environment: () => webEnv(), sqlite });
        const storage = await manager.open('a');
        expect(storage).toBeDefined();
        const status = manager.getStatus();
        expect(status).toMatchObject({ mode: 'memory', reason: 'open_failed' });
        expect((status as { lastError?: string }).lastError).toBe('open failed');
    });

    it('keeps the mode stable after resolution', async () => {
        const sqlite = fakeFactory();
        const { manager } = makeManager({ environment: () => webEnv(), sqlite });
        await manager.open('a');
        const first = manager.getStatus();
        await manager.open('b');
        expect(manager.getStatus()).toEqual(first);
        expect(sqlite.opened).toEqual(['a', 'b']);
    });

    it('records a failed destroy in storage.pendingDeletions and does not throw', async () => {
        const sqlite = fakeFactory({ failDestroy: true });
        const kv = fakeKv();
        const { manager } = makeManager({ environment: nativeEnv, sqlite, kv });
        await expect(manager.destroy('a')).resolves.toBeUndefined();
        expect(kv.data.get('storage.pendingDeletions')).toEqual(['a']);
    });

    it('removes an id from pendingDeletions after a successful destroy', async () => {
        let fail = true;
        const kv = fakeKv();
        const { manager } = makeManager({
            environment: nativeEnv,
            sqlite: {
                open: async () => fakeStorage('sqlite'),
                destroy: async (id: string) => {
                    if (fail) throw new Error('destroy failed');
                },
            },
            kv,
        });
        await manager.destroy('a');
        expect(kv.data.get('storage.pendingDeletions')).toEqual(['a']);
        fail = false;
        await manager.retryPendingDeletions();
        expect(kv.data.get('storage.pendingDeletions')).toEqual([]);
    });

    it('keeps an id in pendingDeletions when the retry fails', async () => {
        const kv = fakeKv();
        const { manager } = makeManager({
            environment: nativeEnv,
            sqlite: fakeFactory({ failDestroy: true }),
            kv,
        });
        await manager.destroy('a');
        await manager.destroy('a');
        expect(kv.data.get('storage.pendingDeletions')).toEqual(['a']);
        await manager.retryPendingDeletions();
        expect(kv.data.get('storage.pendingDeletions')).toEqual(['a']);
    });

    it('gives fresh empty storage after destroy in memory mode', async () => {
        const memory = new MemoryAccountStorageFactory();
        const { manager } = makeManager({ environment: () => webEnv({ crossOriginIsolated: false }), memory });
        const first = await manager.open('a');
        await first.chats.applySnapshot([{
            id: 1, name: 'C', visibility: 'private', directchat: false, role: 'member',
            joined: true, ownerUserid: 'o', members: [],
        }], 100);
        await manager.destroy('a');
        const second = await manager.open('a');
        expect(await second.chats.list()).toEqual([]);
    });
});
