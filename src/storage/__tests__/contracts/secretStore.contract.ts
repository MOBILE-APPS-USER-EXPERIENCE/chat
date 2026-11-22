import type { SecretStore } from '../../ports';
import { SecretKeys } from '../../ports';

const ACCOUNT_ID = '11111111-2222-3333-4444-555555555555';
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

export function secretStoreContract(name: string, make: () => Promise<SecretStore> | SecretStore) {
    describe(`SecretStore (${name})`, () => {
        let store: SecretStore;
        beforeEach(async () => {
            store = await make();
        });

        it('returns null for a missing key', async () => {
            expect(await store.get('token.missing')).toBeNull();
        });

        it('stores and reads a secret', async () => {
            await store.set('token.a', 'secret');
            expect(await store.get('token.a')).toBe('secret');
        });

        it('overwrites an existing secret', async () => {
            await store.set('token.a', 'one');
            await store.set('token.a', 'two');
            expect(await store.get('token.a')).toBe('two');
        });

        it('returns null after delete, and deleting an absent key is fine', async () => {
            await store.set('token.a', 'secret');
            await store.delete('token.a');
            expect(await store.get('token.a')).toBeNull();
            await expect(store.delete('token.a')).resolves.toBeUndefined();
        });

        it('keeps keys independent', async () => {
            await store.set('token.a', 'A');
            await store.set('token.b', 'B');
            await store.delete('token.a');
            expect(await store.get('token.a')).toBeNull();
            expect(await store.get('token.b')).toBe('B');
        });

        it('round-trips unicode and a 4 KB value', async () => {
            const unicode = 'Grüße, 世界 🔐';
            const large = Array.from({ length: 4096 }, (_, i) => String.fromCharCode(33 + (i % 90))).join('');
            await store.set('token.unicode', unicode);
            await store.set('token.large', large);
            expect(await store.get('token.unicode')).toBe(unicode);
            expect(await store.get('token.large')).toBe(large);
        });

        it('works with the real SecretKeys and they are SecureStore-safe', async () => {
            const token = SecretKeys.token(ACCOUNT_ID);
            const adminKey = SecretKeys.adminKey(ACCOUNT_ID);
            expect(token).toMatch(KEY_PATTERN);
            expect(adminKey).toMatch(KEY_PATTERN);
            await store.set(token, 't');
            await store.set(adminKey, 'k');
            expect(await store.get(token)).toBe('t');
            expect(await store.get(adminKey)).toBe('k');
        });
    });
}
