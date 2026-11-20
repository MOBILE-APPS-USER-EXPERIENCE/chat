/**
 * Generic refcounted opener for per-account resources.
 *
 * Each release closure captures the map entry it was created for. When a resource is destroyed
 * and re-acquired, a stale handle released afterwards therefore cannot decrement the new
 * entry's refcount — the bug that motivated extracting this helper out of `openDatabase.ts`.
 */

export type SharedHandle<T> = {
    value: T;
    /** Idempotent: releasing twice is not an error. */
    release(): Promise<void>;
};

export type SharedOpener<T> = {
    /** Concurrent acquires for the same id share one open; every caller must release its handle. */
    acquire(id: string): Promise<SharedHandle<T>>;
    /** Closes the current resource for an id, even while handles are still out. */
    destroy(id: string): Promise<void>;
};

type Entry<T> = {
    promise: Promise<T>;
    /** Number of callers currently holding a handle. */
    refs: number;
};

export function createSharedOpener<T>(
    openFn: (id: string) => Promise<T>,
    closeFn: (value: T) => Promise<void>,
): SharedOpener<T> {
    const entries = new Map<string, Entry<T>>();

    const makeHandle = (id: string, entry: Entry<T>, value: T): SharedHandle<T> => {
        let released = false;
        return {
            value,
            release: async () => {
                if (released) return;
                released = true;
                // Only touch the entry this handle belongs to. After a destroy and re-acquire the
                // map holds a different entry (or none) and the old value is already closed.
                if (entries.get(id) !== entry) return;
                entry.refs -= 1;
                if (entry.refs > 0) return;
                entries.delete(id);
                await closeFn(value);
            },
        };
    };

    return {
        async acquire(id: string): Promise<SharedHandle<T>> {
            const existing = entries.get(id);
            if (existing) {
                existing.refs += 1;
                return makeHandle(id, existing, await existing.promise);
            }

            const entry: Entry<T> = { promise: openFn(id), refs: 1 };
            entries.set(id, entry);
            try {
                return makeHandle(id, entry, await entry.promise);
            } catch (error) {
                // A failed open must not be cached, otherwise every later call fails the same way.
                if (entries.get(id) === entry) entries.delete(id);
                throw error;
            }
        },

        async destroy(id: string): Promise<void> {
            const entry = entries.get(id);
            if (!entry) return;
            entries.delete(id);
            // The open may still be in flight; wait for it so the value is not closed underneath.
            const value = await entry.promise.catch(() => null);
            if (value !== null) await closeFn(value);
        },
    };
}
