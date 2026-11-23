/** @jest-environment node */

import { createSharedOpener } from '../db/sharedOpen';

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('createSharedOpener', () => {
    it('shares one open between concurrent acquires', async () => {
        const gate = deferred<void>();
        const opened: string[] = [];
        const opener = createSharedOpener(
            async (id: string) => {
                await gate.promise;
                opened.push(id);
                return `value-${id}`;
            },
            async () => undefined,
        );

        const first = opener.acquire('a');
        const second = opener.acquire('a');
        gate.resolve();
        const [h1, h2] = await Promise.all([first, second]);

        expect(opened).toEqual(['a']);
        expect(h1.value).toBe('value-a');
        expect(h2.value).toBe('value-a');
        await h1.release();
        await h2.release();
    });

    it('closes only when the last handle is released', async () => {
        const closed: string[] = [];
        const opener = createSharedOpener(
            async (id: string) => `value-${id}`,
            async (value: string) => {
                closed.push(value);
            },
        );

        const h1 = await opener.acquire('a');
        const h2 = await opener.acquire('a');
        await h1.release();
        expect(closed).toEqual([]);
        await h2.release();
        expect(closed).toEqual(['value-a']);
    });

    it('does not cache a failed open', async () => {
        let failNext = true;
        const opener = createSharedOpener(
            async (id: string) => {
                if (failNext) {
                    failNext = false;
                    throw new Error('boom');
                }
                return `value-${id}`;
            },
            async () => undefined,
        );

        await expect(opener.acquire('a')).rejects.toThrow('boom');
        // The next acquire must retry the open, not replay the cached failure.
        const handle = await opener.acquire('a');
        expect(handle.value).toBe('value-a');
        await handle.release();
    });

    it('ignores a stale handle released after destroy and re-acquire', async () => {
        const closed: string[] = [];
        const opener = createSharedOpener(
            async (id: string) => `value-${id}`,
            async (value: string) => {
                closed.push(value);
            },
        );

        const stale = await opener.acquire('a');
        await opener.destroy('a');
        expect(closed).toEqual(['value-a']);

        const fresh = await opener.acquire('a');
        // Releasing the old handle must not close or decrement the new connection.
        await stale.release();
        expect(closed).toEqual(['value-a']);
        await fresh.release();
        expect(closed).toEqual(['value-a', 'value-a']);
    });

    it('waits for an in-flight open on destroy', async () => {
        const gate = deferred<void>();
        const closed: string[] = [];
        const opener = createSharedOpener(
            async (id: string) => {
                await gate.promise;
                return `value-${id}`;
            },
            async (value: string) => {
                closed.push(value);
            },
        );

        const inFlight = opener.acquire('a');
        const destroying = opener.destroy('a');
        gate.resolve();
        // The acquire still resolves, but its handle is stale: the value was closed by destroy.
        const stale = await inFlight;
        await destroying;
        expect(closed).toEqual(['value-a']);
        await stale.release();
        expect(closed).toEqual(['value-a']);
    });

    it('treats release as idempotent', async () => {
        const closed: string[] = [];
        const opener = createSharedOpener(
            async (id: string) => `value-${id}`,
            async (value: string) => {
                closed.push(value);
            },
        );

        const handle = await opener.acquire('a');
        await handle.release();
        await handle.release();
        expect(closed).toEqual(['value-a']);
    });
});
