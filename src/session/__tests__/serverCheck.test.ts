/** @jest-environment node */
import { addAndSelectServer, checkServerUrl } from '../serverCheck';

function fakePing(result: boolean | Error) {
    const calls: string[] = [];
    const ping = async (url: string): Promise<boolean> => {
        calls.push(url);
        if (result instanceof Error) throw result;
        return result;
    };
    return { ping, calls };
}

function fakeAdd(existingUrls: string[], failure?: Error) {
    const changed: string[] = [];
    return {
        changed,
        deps: {
            listServerUrls: async () => existingUrls,
            changeServer: async (url: string) => {
                if (failure) throw failure;
                changed.push(url);
            },
        },
    };
}

describe('checkServerUrl', () => {
    it('does not ping an invalid URL', async () => {
        const { ping, calls } = fakePing(true);
        expect(await checkServerUrl('ftp://x', ping)).toEqual({ status: 'invalid', reason: 'unsupported_scheme' });
        expect(calls).toEqual([]);
    });

    it('pings the normalized URL and reports ok', async () => {
        const { ping, calls } = fakePing(true);
        expect(await checkServerUrl(' Example.com/chat/ ', ping)).toEqual({
            status: 'ok',
            url: 'https://example.com/chat',
        });
        expect(calls).toEqual(['https://example.com/chat']);
    });

    it('reports unreachable when the ping returns false', async () => {
        const { ping } = fakePing(false);
        expect(await checkServerUrl('example.com', ping)).toEqual({
            status: 'unreachable',
            url: 'https://example.com',
        });
    });

    it('propagates unexpected ping errors', async () => {
        const { ping } = fakePing(new Error('boom'));
        await expect(checkServerUrl('example.com', ping)).rejects.toThrow('boom');
    });
});

describe('addAndSelectServer', () => {
    it('does not call changeServer for an invalid URL', async () => {
        const { deps, changed } = fakeAdd([]);
        expect(await addAndSelectServer('https://u:p@example.com', deps)).toEqual({
            status: 'invalid',
            reason: 'has_credentials',
        });
        expect(changed).toEqual([]);
    });

    it('adds and selects a new server', async () => {
        const { deps, changed } = fakeAdd(['https://api.chat.throin.de']);
        expect(await addAndSelectServer('example.com/', deps)).toEqual({
            status: 'added',
            url: 'https://example.com',
        });
        expect(changed).toEqual(['https://example.com']);
    });

    it('reports an existing server (matched after normalization) and still selects it', async () => {
        const { deps, changed } = fakeAdd(['https://api.chat.throin.de']);
        expect(await addAndSelectServer('https://api.chat.throin.de/', deps)).toEqual({
            status: 'existing',
            url: 'https://api.chat.throin.de',
        });
        expect(changed).toEqual(['https://api.chat.throin.de']);
    });

    it('propagates changeServer errors', async () => {
        const { deps } = fakeAdd([], new Error('storage failed'));
        await expect(addAndSelectServer('example.com', deps)).rejects.toThrow('storage failed');
    });
});
