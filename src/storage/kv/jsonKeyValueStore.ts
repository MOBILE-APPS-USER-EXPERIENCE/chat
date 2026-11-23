import type { AsyncStringBackend, KeyValueStore } from '../ports';
import { KeyValueParseError } from '../ports';

/** JSON key-value store on top of any async string backend. Storing `null` reads back as "absent". */
export class JsonKeyValueStore implements KeyValueStore {
    constructor(private readonly backend: AsyncStringBackend) { }

    async getJson<T>(key: string): Promise<T | null> {
        const raw = await this.backend.getItem(key);
        if (raw === null) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            // The original SyntaxError is not attached: its message can quote parts of the raw value.
            throw new KeyValueParseError(`Stored value for key "${key}" is not valid JSON`);
        }
    }

    async setJson<T>(key: string, value: T): Promise<void> {
        const serialized = JSON.stringify(value) as string | undefined;
        if (serialized === undefined) {
            throw new TypeError(`Value for key "${key}" is not JSON-serializable`);
        }
        await this.backend.setItem(key, serialized);
    }

    async remove(key: string): Promise<void> {
        await this.backend.removeItem(key);
    }
}
