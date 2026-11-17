import type { AsyncStringBackend, SecretStore } from '../ports';

/** Map-based fake for tests. */
export class MemoryStringBackend implements AsyncStringBackend {
    private readonly items = new Map<string, string>();

    async getItem(key: string) {
        return this.items.get(key) ?? null;
    }

    async setItem(key: string, value: string) {
        this.items.set(key, value);
    }

    async removeItem(key: string) {
        this.items.delete(key);
    }
}

/** Map-based fake for tests. */
export class MemorySecretStore implements SecretStore {
    private readonly items = new Map<string, string>();

    async get(key: string) {
        return this.items.get(key) ?? null;
    }

    async set(key: string, value: string) {
        this.items.set(key, value);
    }

    async delete(key: string) {
        this.items.delete(key);
    }
}
