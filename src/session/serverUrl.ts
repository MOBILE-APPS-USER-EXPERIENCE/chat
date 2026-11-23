import { normalizeServerUrl } from '../storage/registryRules';

export type ServerUrlFailure =
    | 'empty'
    | 'invalid'
    | 'unsupported_scheme'
    | 'has_credentials'
    | 'has_query_or_hash';

export type ParseServerUrlResult =
    | { ok: true; url: string }
    | { ok: false; reason: ServerUrlFailure };

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http', 'https']);
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
const PORT_REST = /^\d+(?:[/?#]|$)/;

/**
 * Returns the explicit scheme (lower case) or null. "localhost:8080" and "host:80/x" are
 * host:port, not a scheme; "javascript:alert(1)" and "mailto:a@b" are schemes.
 */
function explicitScheme(value: string): string | null {
    const match = SCHEME_PREFIX.exec(value);
    if (!match) return null;
    const rest = value.slice(match[0].length);
    if (PORT_REST.test(rest)) return null;
    return (match[1] ?? '').toLowerCase();
}

/**
 * Validates and normalizes a server URL typed by the user. Pure: no storage, window or document.
 * Missing scheme means https. Only http/https, no credentials, no query, no fragment.
 */
export function parseServerUrl(input: string): ParseServerUrlResult {
    const trimmed = input.trim();
    if (trimmed === '') return { ok: false, reason: 'empty' };
    // Whitespace inside the URL is a typo; the URL parser would silently strip or encode some of it.
    if (/\s/.test(trimmed)) return { ok: false, reason: 'invalid' };

    const scheme = explicitScheme(trimmed);
    if (scheme !== null && !ALLOWED_SCHEMES.has(scheme)) {
        return { ok: false, reason: 'unsupported_scheme' };
    }
    const candidate = scheme === null ? `https://${trimmed}` : trimmed;

    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        return { ok: false, reason: 'invalid' };   // the URL parser rejected the input
    }
    if (parsed.host === '') return { ok: false, reason: 'invalid' };
    if (parsed.username !== '' || parsed.password !== '') {
        return { ok: false, reason: 'has_credentials' };
    }
    // Checked on the raw string: URL.search/hash are empty for a bare "?" or "#".
    if (candidate.includes('?') || candidate.includes('#')) {
        return { ok: false, reason: 'has_query_or_hash' };
    }

    // protocol, host (lower case, default port removed) and pathname come from the parser.
    const url = normalizeServerUrl(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);
    return { ok: true, url };
}

/** Host plus path (if not "/"), so two servers on one host get different names. */
export function serverDisplayName(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.host === '') return url;
        return `${parsed.host}${normalizeServerUrl(parsed.pathname)}`;
    } catch {
        return url;   // not parseable: use the URL itself as the name
    }
}
