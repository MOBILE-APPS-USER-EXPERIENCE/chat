import { JsonKeyValueStore } from '../kv/jsonKeyValueStore';
import { MemoryStringBackend } from '../memory';
import type { RegistryRepository } from '../ports';
import { DEFAULT_SERVERS, ensureServers } from '../registry/defaultServers';
import { KvRegistryRepository, REGISTRY_KEY } from '../registry/kvRegistryRepository';

function setup() {
    const backend = new MemoryStringBackend();
    let counter = 0;
    const registry = new KvRegistryRepository(new JsonKeyValueStore(backend), {
        now: () => 123,
        newId: () => `id-${++counter}`,
    });
    return { backend, registry };
}

describe('ensureServers', () => {
    it('adds both default servers to an empty registry', async () => {
        const { registry } = setup();
        await ensureServers(registry, DEFAULT_SERVERS);
        expect((await registry.listServers()).map(({ name, url }) => ({ name, url }))).toEqual(
            DEFAULT_SERVERS.map(({ name, url }) => ({ name, url })),
        );
    });

    it('is idempotent: a second call adds nothing and keeps the ids', async () => {
        const { backend, registry } = setup();
        await ensureServers(registry, DEFAULT_SERVERS);
        const before = await registry.listServers();
        const raw = await backend.getItem(REGISTRY_KEY);
        await ensureServers(registry, DEFAULT_SERVERS);
        expect(await registry.listServers()).toEqual(before);
        expect(await backend.getItem(REGISTRY_KEY)).toBe(raw);
    });

    it('does not duplicate or rename a pre-existing server (same URL with trailing slash)', async () => {
        const { registry } = setup();
        const existing = await registry.addServer('My own name', 'https://www2.hs-esslingen.de/~chkohl/chat/');
        await ensureServers(registry, DEFAULT_SERVERS);
        const servers = await registry.listServers();
        expect(servers).toHaveLength(2);
        expect(servers[0]).toEqual(existing);
        expect(servers[0]).toMatchObject({ name: 'My own name', url: 'https://www2.hs-esslingen.de/~chkohl/chat' });
        expect(servers[1]).toMatchObject({ url: 'https://api.chat.throin.de' });
    });

    it('propagates errors other than ServerExistsError', async () => {
        const failing = { addServer: async () => { throw new Error('boom'); } } as unknown as RegistryRepository;
        await expect(ensureServers(failing, DEFAULT_SERVERS)).rejects.toThrow('boom');
    });
});
