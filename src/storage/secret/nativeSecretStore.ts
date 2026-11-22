import * as SecureStore from 'expo-secure-store';

import type { SecretStore } from '../ports';

const VALID_KEY = /^[A-Za-z0-9._-]+$/;

function assertValidKey(key: string): void {
    if (!VALID_KEY.test(key)) {
        throw new Error('Invalid secret key: SecureStore only accepts A-Z, a-z, 0-9, ".", "_" and "-"');
    }
}

/** Secrets in the iOS Keychain / Android Keystore via expo-secure-store. */
export class NativeSecretStore implements SecretStore {
    async get(key: string): Promise<string | null> {
        assertValidKey(key);
        return SecureStore.getItemAsync(key);
    }

    async set(key: string, value: string): Promise<void> {
        assertValidKey(key);
        await SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
    }

    async delete(key: string): Promise<void> {
        assertValidKey(key);
        await SecureStore.deleteItemAsync(key);
    }
}
