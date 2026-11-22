import { DEFAULT_SERVER_URL } from '../storage/registry/defaultServers';
import { normalizeServerUrl } from '../storage/registryRules';

const MIN_TOKEN_LENGTH = 5;
let warned = false;

/** X-Access-Token is only sent to the HS default server. Env is read lazily, never at import. */
export function headersForServer(url: string): Record<string, string> {
    if (normalizeServerUrl(url) !== DEFAULT_SERVER_URL) return {};
    const value = process.env.EXPO_PUBLIC_X_ACCESS_TOKEN ?? '';
    if (value.length < MIN_TOKEN_LENGTH && !warned) {
        warned = true;
        console.warn('EXPO_PUBLIC_X_ACCESS_TOKEN is missing or too short; the default server will probably reject requests.');
    }
    return { 'X-Access-Token': value };
}
