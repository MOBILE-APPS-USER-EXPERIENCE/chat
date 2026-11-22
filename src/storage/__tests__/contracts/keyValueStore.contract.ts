import type { KeyValueStore } from '../../ports';

export function keyValueStoreContract(name: string, make: () => Promise<KeyValueStore> | KeyValueStore) {
    describe(`KeyValueStore (${name})`, () => {
        let store: KeyValueStore;
        beforeEach(async () => {
            store = await make();
        });

        it('returns null for a missing key', async () => {
            expect(await store.getJson('missing')).toBeNull();
        });

        const values: [string, unknown][] = [
            ['object', { a: 1, b: { c: [1, 2] } }],
            ['array', [1, 'two', null]],
            ['string', 'text'],
            ['empty string', ''],
            ['number', 42],
            ['zero', 0],
            ['boolean', false],
        ];
        it.each(values)('round-trips %s', async (_label, value) => {
            await store.setJson('k', value);
            expect(await store.getJson<unknown>('k')).toEqual(value);
        });

        it('overwrites an existing value', async () => {
            await store.setJson('k', { v: 1 });
            await store.setJson('k', { v: 2 });
            expect(await store.getJson('k')).toEqual({ v: 2 });
        });

        it('returns null after remove, and removing an absent key is fine', async () => {
            await store.setJson('k', 1);
            await store.remove('k');
            expect(await store.getJson('k')).toBeNull();
            await expect(store.remove('k')).resolves.toBeUndefined();
        });

        it('keeps two keys independent', async () => {
            await store.setJson('a', 1);
            await store.setJson('b', 2);
            await store.remove('a');
            expect(await store.getJson('a')).toBeNull();
            expect(await store.getJson('b')).toBe(2);
        });

        it('rejects undefined and functions with TypeError and keeps the old value', async () => {
            await store.setJson('k', { old: true });
            await expect(store.setJson('k', undefined)).rejects.toBeInstanceOf(TypeError);
            await expect(store.setJson('k', () => 1)).rejects.toBeInstanceOf(TypeError);
            expect(await store.getJson('k')).toEqual({ old: true });
        });

        it('returns copies and stores a snapshot of the input', async () => {
            const input = { list: [1], nested: { x: 1 } };
            await store.setJson('k', input);
            input.list.push(2);
            input.nested.x = 99;
            const read = await store.getJson<typeof input>('k');
            if (!read) throw new Error('expected a stored value');
            read.list.push(3);
            read.nested.x = 77;
            expect(await store.getJson('k')).toEqual({ list: [1], nested: { x: 1 } });
        });
    });
}
