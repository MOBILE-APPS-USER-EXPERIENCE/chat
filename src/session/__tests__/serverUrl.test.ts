/** @jest-environment node */
import { DEFAULT_SERVER_URL } from '../../storage/registry/defaultServers';
import { parseServerUrl, serverDisplayName } from '../serverUrl';

describe('parseServerUrl', () => {
    it('rejects empty and whitespace-only input as empty', () => {
        expect(parseServerUrl('')).toEqual({ ok: false, reason: 'empty' });
        expect(parseServerUrl('   \t ')).toEqual({ ok: false, reason: 'empty' });
    });

    it('assumes https when the scheme is missing', () => {
        expect(parseServerUrl('chat.example.de')).toEqual({ ok: true, url: 'https://chat.example.de' });
    });

    it('accepts a single-label host (intranet name)', () => {
        expect(parseServerUrl('foo')).toEqual({ ok: true, url: 'https://foo' });
    });

    it('accepts http', () => {
        expect(parseServerUrl('http://chat.example.de')).toEqual({ ok: true, url: 'http://chat.example.de' });
    });

    it('accepts https', () => {
        expect(parseServerUrl('https://chat.example.de')).toEqual({ ok: true, url: 'https://chat.example.de' });
    });

    it('lower-cases scheme and host but keeps the path case', () => {
        expect(parseServerUrl('HTTPS://Chat.Example.DE/Chat')).toEqual({
            ok: true,
            url: 'https://chat.example.de/Chat',
        });
    });

    it.each(['ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'mailto:a@b.de'])(
        'rejects the unsupported scheme in %s',
        (input) => {
            expect(parseServerUrl(input)).toEqual({ ok: false, reason: 'unsupported_scheme' });
        },
    );

    it.each(['https://user:secret@example.com', 'https://user@example.com', 'http://user:pw@example.com/chat'])(
        'rejects credentials in %s',
        (input) => {
            expect(parseServerUrl(input)).toEqual({ ok: false, reason: 'has_credentials' });
        },
    );

    it.each([
        'https://example.com/chat?x=1',
        'https://example.com/#top',
        'https://example.com/?',
        'example.com#frag',
    ])('rejects query or fragment in %s', (input) => {
        expect(parseServerUrl(input)).toEqual({ ok: false, reason: 'has_query_or_hash' });
    });

    it('strips trailing slashes', () => {
        expect(parseServerUrl('https://example.com///')).toEqual({ ok: true, url: 'https://example.com' });
        expect(parseServerUrl('https://example.com/chat/')).toEqual({ ok: true, url: 'https://example.com/chat' });
    });

    it('keeps the path', () => {
        expect(parseServerUrl('https://www2.hs-esslingen.de/~chkohl/chat')).toEqual({
            ok: true,
            url: 'https://www2.hs-esslingen.de/~chkohl/chat',
        });
    });

    it('trims surrounding whitespace', () => {
        expect(parseServerUrl('  https://example.com/chat \n')).toEqual({ ok: true, url: 'https://example.com/chat' });
    });

    it('rejects whitespace inside the URL as invalid', () => {
        expect(parseServerUrl('https://exa mple.com')).toEqual({ ok: false, reason: 'invalid' });
        expect(parseServerUrl('foo bar')).toEqual({ ok: false, reason: 'invalid' });
    });

    it.each(['https://', 'http://', 'http://:80', '::1'])('rejects %s as invalid', (input) => {
        expect(parseServerUrl(input)).toEqual({ ok: false, reason: 'invalid' });
    });

    it('accepts IPv4 with port, with and without scheme', () => {
        expect(parseServerUrl('192.168.1.10:8080')).toEqual({ ok: true, url: 'https://192.168.1.10:8080' });
        expect(parseServerUrl('http://192.168.1.10:8080/chat/')).toEqual({
            ok: true,
            url: 'http://192.168.1.10:8080/chat',
        });
    });

    it('treats host:port as host, not as scheme', () => {
        expect(parseServerUrl('localhost:3000')).toEqual({ ok: true, url: 'https://localhost:3000' });
        expect(parseServerUrl('localhost:3000/chat')).toEqual({ ok: true, url: 'https://localhost:3000/chat' });
    });

    it('accepts IPv6 literals', () => {
        expect(parseServerUrl('http://[::1]:8080')).toEqual({ ok: true, url: 'http://[::1]:8080' });
        expect(parseServerUrl('[::1]:8080')).toEqual({ ok: true, url: 'https://[::1]:8080' });
    });

    it('removes the default port', () => {
        expect(parseServerUrl('https://example.com:443')).toEqual({ ok: true, url: 'https://example.com' });
    });

    it('is idempotent on its own output', () => {
        const first = parseServerUrl('Example.com:8443/Chat//');
        expect(first.ok).toBe(true);
        if (first.ok) expect(parseServerUrl(first.url)).toEqual(first);
    });

    it('maps the default server URL (with trailing slash) to DEFAULT_SERVER_URL', () => {
        expect(parseServerUrl('https://www2.hs-esslingen.de/~chkohl/chat/')).toEqual({
            ok: true,
            url: DEFAULT_SERVER_URL,
        });
    });
});

describe('serverDisplayName', () => {
    it('returns only the host when there is no path', () => {
        expect(serverDisplayName('https://api.chat.throin.de')).toBe('api.chat.throin.de');
        expect(serverDisplayName('https://api.chat.throin.de/')).toBe('api.chat.throin.de');
    });

    it('appends the path when it is not "/"', () => {
        expect(serverDisplayName('https://www2.hs-esslingen.de/~chkohl/chat')).toBe(
            'www2.hs-esslingen.de/~chkohl/chat',
        );
    });

    it('gives two servers on one host with different paths different names', () => {
        expect(serverDisplayName('https://example.com/a')).not.toBe(serverDisplayName('https://example.com/b'));
    });

    it('keeps the port', () => {
        expect(serverDisplayName('http://192.168.1.10:8080')).toBe('192.168.1.10:8080');
    });

    it('falls back to the URL string when it cannot be parsed', () => {
        expect(serverDisplayName('not a url')).toBe('not a url');
        expect(serverDisplayName('')).toBe('');
    });
});
