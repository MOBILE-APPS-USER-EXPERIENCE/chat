// INSECURE: values are kept in localStorage, which any script on the origin can read.
// An XSS bug exposes every token and admin key. This is an interim solution only and
// is to be replaced by a password-derived vault.
//
// localStorage is only touched inside methods (never at import time or in the
// constructor), because this module is also evaluated in Node during static rendering.
import type { SecretStore } from '../ports';

type SecretStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIX = 'chat.secret.';

function defaultGetStorage(): SecretStorage | undefined {
    try {
        return globalThis.localStorage as SecretStorage | undefined;
    } catch {
        // Some browsers throw a SecurityError when storage access is blocked: treat as unavailable.
        return undefined;
    }
}

export class WebSecretStore implements SecretStore {
    constructor(private readonly getStorage: () => SecretStorage | undefined = defaultGetStorage) { }

    async get(key: string): Promise<string | null> {
        return this.getStorage()?.getItem(PREFIX + key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        const storage = this.getStorage();
        if (!storage) throw new Error('Secret storage unavailable');
        storage.setItem(PREFIX + key, value);
    }

    async delete(key: string): Promise<void> {
        this.getStorage()?.removeItem(PREFIX + key);
    }
}
