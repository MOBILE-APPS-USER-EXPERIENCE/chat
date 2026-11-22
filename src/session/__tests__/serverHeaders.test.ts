import { DEFAULT_SERVER_URL } from '../../storage/registry/defaultServers';
import { headersForServer } from '../serverHeaders';

const original = process.env.EXPO_PUBLIC_X_ACCESS_TOKEN;

afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_X_ACCESS_TOKEN;
    else process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = original;
    jest.restoreAllMocks();
});

describe('headersForServer', () => {
    it('returns the header only for the default server, also with a trailing slash', () => {
        process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = 'secret-token';
        expect(headersForServer(DEFAULT_SERVER_URL)).toEqual({ 'X-Access-Token': 'secret-token' });
        expect(headersForServer(`${DEFAULT_SERVER_URL}/`)).toEqual({ 'X-Access-Token': 'secret-token' });
    });

    it('returns no headers for other servers', () => {
        process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = 'secret-token';
        expect(headersForServer('https://api.chat.throin.de')).toEqual({});
        expect(headersForServer('https://other.example')).toEqual({});
    });

    it('reads the env lazily on every call', () => {
        process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = 'first-token';
        expect(headersForServer(DEFAULT_SERVER_URL)).toEqual({ 'X-Access-Token': 'first-token' });
        process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = 'second-token';
        expect(headersForServer(DEFAULT_SERVER_URL)).toEqual({ 'X-Access-Token': 'second-token' });
    });

    it('warns once, without the value, when the token is shorter than 5 characters', () => {
        process.env.EXPO_PUBLIC_X_ACCESS_TOKEN = 'xy-1';
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.resetModules();
        const fresh = jest.requireActual<typeof import('../serverHeaders')>('../serverHeaders');
        fresh.headersForServer(DEFAULT_SERVER_URL);
        fresh.headersForServer(DEFAULT_SERVER_URL);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(warn.mock.calls)).not.toContain('xy-1');
    });
});
