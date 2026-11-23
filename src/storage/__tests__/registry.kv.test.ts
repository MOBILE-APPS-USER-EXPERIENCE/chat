import { JsonKeyValueStore } from '../kv/jsonKeyValueStore';
import { MemoryStringBackend } from '../memory';
import {
    AccountExistsError, KeyValueParseError, RegistryCorruptError, RegistryVersionError,
} from '../ports';
import { KvRegistryRepository, REGISTRY_KEY } from '../registry/kvRegistryRepository';
import { registryRepositoryContract } from './contracts/registry.contract';

function open(backend: MemoryStringBackend, newId?: () => string) {
    let counter = 0;
    return new KvRegistryRepository(new JsonKeyValueStore(backend), {
        now: () => 123,
        newId: newId ?? (() => `id-${++counter}`),
    });
}

function setup(newId?: () => string) {
    const backend = new MemoryStringBackend();
    return { backend, registry: open(backend, newId) };
}

registryRepositoryContract('KvRegistryRepository', () => setup().registry);

type ErrorClass = new (message?: string) => Error;

async function expectRejectedAndUntouched(raw: string, errorClass: ErrorClass) {
    const { backend, registry } = setup();
    await backend.setItem(REGISTRY_KEY, raw);
    await expect(registry.listServers()).rejects.toBeInstanceOf(errorClass);
    await expect(registry.listAccounts()).rejects.toBeInstanceOf(errorClass);
    await expect(registry.getActiveAccountId()).rejects.toBeInstanceOf(errorClass);
    await expect(registry.addServer('N', 'https://n.example')).rejects.toBeInstanceOf(errorClass);
    await expect(registry.createAccount({ serverId: 's', userid: 'u' })).rejects.toBeInstanceOf(errorClass);
    await expect(registry.updateAccount('a', {})).rejects.toBeInstanceOf(errorClass);
    await expect(registry.removeAccount('a')).rejects.toBeInstanceOf(errorClass);
    await expect(registry.setActiveAccountId(null)).rejects.toBeInstanceOf(errorClass);
    expect(await backend.getItem(REGISTRY_KEY)).toBe(raw);
}

describe('KvRegistryRepository specifics', () => {
    it('treats a missing key as an empty registry and does not write on reads', async () => {
        const { backend, registry } = setup();
        expect(await registry.listServers()).toEqual([]);
        expect(await registry.listAccounts()).toEqual([]);
        expect(await registry.getActiveAccountId()).toBeNull();
        expect(await backend.getItem(REGISTRY_KEY)).toBeNull();
    });

    it('persists a version 1 document under registry.v1', async () => {
        const { backend, registry } = setup();
        await registry.addServer('Main', 'https://main.example');
        const doc = JSON.parse((await backend.getItem(REGISTRY_KEY)) ?? 'null');
        expect(doc).toMatchObject({ version: 1, activeAccountId: null, accounts: [] });
        expect(doc.servers).toHaveLength(1);
    });

    it('reads always hit the store (no cache)', async () => {
        const { backend, registry } = setup();
        expect(await registry.listServers()).toEqual([]);
        await backend.setItem(REGISTRY_KEY, JSON.stringify({
            version: 1, activeAccountId: null, accounts: [],
            servers: [{ id: 'x', name: 'N', url: 'https://x.example' }],
        }));
        expect(await registry.listServers()).toEqual([{ id: 'x', name: 'N', url: 'https://x.example' }]);
    });

    it('a second instance over the same backend sees accounts and the active account', async () => {
        const { backend, registry } = setup();
        const server = await registry.addServer('Main', 'https://main.example');
        const account = await registry.createAccount({ serverId: server.id, userid: 'Alice', nickname: 'A' });
        await registry.setActiveAccountId(account.id);
        const second = open(backend);
        expect(await second.listServers()).toEqual([server]);
        expect(await second.listAccounts()).toEqual([account]);
        expect(await second.getActiveAccountId()).toBe(account.id);
    });

    it('corrupt JSON: every call rejects with KeyValueParseError and the backend is unchanged', async () => {
        await expectRejectedAndUntouched('{not json', KeyValueParseError);
    });

    it.each([
        ['version 2', JSON.stringify({ version: 2, activeAccountId: null, servers: [], accounts: [] })],
        ['version 2 with unknown shape', '{"version":2}'],
    ] as [string, string][])('%s: rejects with RegistryVersionError and the backend is unchanged', async (_label, raw) => {
        await expectRejectedAndUntouched(raw, RegistryVersionError);
    });

    it.each([
        ['array', '[]'],
        ['string', '"text"'],
        ['number', '42'],
        ['empty object', '{}'],
        ['non-numeric version', '{"version":"1","activeAccountId":null,"servers":[],"accounts":[]}'],
        ['servers missing', '{"version":1,"activeAccountId":null,"accounts":[]}'],
        ['servers not an array', '{"version":1,"activeAccountId":null,"servers":{},"accounts":[]}'],
        ['accounts missing', '{"version":1,"activeAccountId":null,"servers":[]}'],
        ['activeAccountId missing', '{"version":1,"servers":[],"accounts":[]}'],
        ['activeAccountId not string/null', '{"version":1,"activeAccountId":5,"servers":[],"accounts":[]}'],
        ['invalid server entry', '{"version":1,"activeAccountId":null,"servers":[{"id":1}],"accounts":[]}'],
        ['invalid account entry', '{"version":1,"activeAccountId":null,"servers":[],"accounts":[{"id":"a"}]}'],
    ] as [string, string][])('wrong shape (%s): rejects with RegistryCorruptError and the backend is unchanged', async (_label, raw) => {
        await expectRejectedAndUntouched(raw, RegistryCorruptError);
    });

    it('does not put stored data into the corrupt error message', async () => {
        const { backend, registry } = setup();
        await backend.setItem(REGISTRY_KEY, '{"version":1,"activeAccountId":"SECRET-ID","servers":"SECRET","accounts":[]}');
        const error = await registry.listServers().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(RegistryCorruptError);
        expect((error as Error).message).not.toContain('SECRET');
    });

    it('failed operations leave the stored string byte-identical', async () => {
        const { backend, registry } = setup();
        const server = await registry.addServer('Main', 'https://main.example');
        const account = await registry.createAccount({ serverId: server.id, userid: 'Alice' });
        const before = await backend.getItem(REGISTRY_KEY);
        await expect(registry.createAccount({ serverId: server.id, userid: 'alice' })).rejects.toBeInstanceOf(AccountExistsError);
        await expect(registry.createAccount({ serverId: 'missing', userid: 'bob' })).rejects.toThrow();
        await expect(registry.addServer('Dup', 'https://main.example/')).rejects.toThrow();
        await expect(registry.addServer('', 'https://x.example')).rejects.toThrow();
        await expect(registry.updateAccount('missing', { nickname: 'x' })).rejects.toThrow();
        await expect(registry.setActiveAccountId('missing')).rejects.toThrow();
        expect(await backend.getItem(REGISTRY_KEY)).toBe(before);
        expect(await registry.listAccounts()).toEqual([account]);
    });

    it('persists all 20 parallel createAccount calls in call order', async () => {
        const { registry } = setup();
        const server = await registry.addServer('Main', 'https://main.example');
        const userids = Array.from({ length: 20 }, (_, i) => `user${i}`);
        await Promise.all(userids.map(userid => registry.createAccount({ serverId: server.id, userid })));
        expect((await registry.listAccounts()).map(account => account.userid)).toEqual(userids);
    });

    it('parallel createAccount with the same userid: exactly one succeeds, the rest reject with AccountExistsError', async () => {
        const { registry } = setup();
        const server = await registry.addServer('Main', 'https://main.example');
        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () => registry.createAccount({ serverId: server.id, userid: 'Alice' })),
        );
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(rejected).toHaveLength(4);
        for (const result of rejected) expect(result.reason).toBeInstanceOf(AccountExistsError);
        expect(await registry.listAccounts()).toHaveLength(1);
    });

    it('does not poison the queue after a rejected mutation', async () => {
        const { registry } = setup();
        const server = await registry.addServer('Main', 'https://main.example');
        const [bad, good] = await Promise.allSettled([
            registry.createAccount({ serverId: 'missing', userid: 'a' }),
            registry.createAccount({ serverId: server.id, userid: 'b' }),
        ]);
        expect(bad.status).toBe('rejected');
        expect(good.status).toBe('fulfilled');
        await expect(registry.createAccount({ serverId: server.id, userid: 'c' })).resolves.toMatchObject({ userid: 'c' });
    });

    it('keeps insertion order for integer-like ids', async () => {
        const ids = ['10', '2', '1', '20', '3', '11'];
        const { registry } = setup(() => {
            const id = ids.shift();
            if (id === undefined) throw new Error('out of ids');
            return id;
        });
        for (const name of ['a', 'b', 'c']) await registry.addServer(name, `https://${name}.example`);
        const [first] = await registry.listServers();
        if (!first) throw new Error('expected a server');
        for (const userid of ['x', 'y', 'z']) await registry.createAccount({ serverId: first.id, userid });
        expect((await registry.listServers()).map(server => server.id)).toEqual(['10', '2', '1']);
        expect((await registry.listAccounts()).map(account => account.id)).toEqual(['20', '3', '11']);
    });
});
