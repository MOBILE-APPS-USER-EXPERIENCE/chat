import { JsonKeyValueStore } from '../kv/jsonKeyValueStore';
import { MemoryStringBackend } from '../memory';
import { KeyValueParseError } from '../ports';
import { keyValueStoreContract } from './contracts/keyValueStore.contract';

keyValueStoreContract('JsonKeyValueStore over MemoryStringBackend', () => new JsonKeyValueStore(new MemoryStringBackend()));

describe('JsonKeyValueStore specifics', () => {
    it('rejects corrupt JSON with KeyValueParseError and does not leak the raw value', async () => {
        const backend = new MemoryStringBackend();
        const raw = '{"secret":"hunter2"';
        await backend.setItem('registry.v1', raw);
        const error = await new JsonKeyValueStore(backend).getJson('registry.v1').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(KeyValueParseError);
        const message = (error as Error).message;
        expect(message).toContain('registry.v1');
        expect(message).not.toContain('hunter2');
        expect(message).not.toContain(raw);
    });

    it('never writes the string "undefined"', async () => {
        const backend = new MemoryStringBackend();
        await expect(new JsonKeyValueStore(backend).setJson('fresh', undefined)).rejects.toBeInstanceOf(TypeError);
        expect(await backend.getItem('fresh')).toBeNull();
    });
});
