import * as SecureStore from 'expo-secure-store';

import { MemorySecretStore } from '../memory';
import { NativeSecretStore } from '../secret/nativeSecretStore';
import { WebSecretStore } from '../secret/webSecretStore';
import { secretStoreContract } from './contracts/secretStore.contract';

const mockSecureItems = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'mock-after-first-unlock-this-device-only',
    getItemAsync: jest.fn(async (key: string) => mockSecureItems.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureItems.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { mockSecureItems.delete(key); }),
}));

class FakeStorage {
    private readonly items = new Map<string, string>();
    getItem(key: string) { return this.items.get(key) ?? null; }
    setItem(key: string, value: string) { this.items.set(key, value); }
    removeItem(key: string) { this.items.delete(key); }
    keys() { return [...this.items.keys()]; }
}

secretStoreContract('MemorySecretStore', () => new MemorySecretStore());
secretStoreContract('WebSecretStore', () => {
    const fake = new FakeStorage();
    return new WebSecretStore(() => fake);
});
// The 4 KB case runs against the mock here, so it only proves the wrapper passes values through
// unchanged. Real Keychain/Keystore limits are not covered.
secretStoreContract('NativeSecretStore (mocked expo-secure-store)', () => {
    mockSecureItems.clear();
    return new NativeSecretStore();
});

describe('WebSecretStore specifics', () => {
    it('stores under the chat.secret. prefix', async () => {
        const fake = new FakeStorage();
        await new WebSecretStore(() => fake).set('token.a', 'v');
        expect(fake.keys()).toEqual(['chat.secret.token.a']);
        expect(fake.getItem('chat.secret.token.a')).toBe('v');
    });

    it('does not touch storage in the constructor', () => {
        const getStorage = jest.fn(() => new FakeStorage());
        new WebSecretStore(getStorage);
        expect(getStorage).not.toHaveBeenCalled();
    });

    it('without storage: get is null, delete is a no-op, set throws', async () => {
        const store = new WebSecretStore(() => undefined);
        expect(await store.get('token.a')).toBeNull();
        await expect(store.delete('token.a')).resolves.toBeUndefined();
        await expect(store.set('token.a', 'v')).rejects.toThrow('Secret storage unavailable');
    });
});

describe('NativeSecretStore specifics', () => {
    beforeEach(() => {
        mockSecureItems.clear();
        jest.clearAllMocks();
    });

    it('passes keychainAccessible AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY on set', async () => {
        await new NativeSecretStore().set('token.a', 'v');
        expect(jest.mocked(SecureStore.setItemAsync)).toHaveBeenCalledWith('token.a', 'v', {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
    });

    it.each(['bad key', 'tökén', 'a/b', ''])('rejects invalid key %j before any SecureStore call', async (key) => {
        const store = new NativeSecretStore();
        await expect(store.get(key)).rejects.toThrow('Invalid secret key');
        await expect(store.set(key, 'secret-value')).rejects.toThrow('Invalid secret key');
        await expect(store.delete(key)).rejects.toThrow('Invalid secret key');
        expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
});
