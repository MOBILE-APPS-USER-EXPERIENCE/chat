import { ping } from '../api/connectivityService';
import { DEFAULT_SERVER_URL } from '../storage/registry/defaultServers';
import { session } from './index';
import { NoServerSelectedError } from './ports';
import { headersForServer } from './serverHeaders';
import { parseServerUrl, serverDisplayName } from './serverUrl';

const TEST_TIMEOUT_MS = 3000;

export async function getCurrentServer(): Promise<string> {
    await session.init();
    const state = session.getState();

    let server = null;
    if (state.status === 'signed_in') {
        server = state.server;
    }
    if (state.status === 'signed_out') {
        server = state.selectedServer;
    }
    if (!server) throw new NoServerSelectedError();
    return server.url;
}

/** Finds the server by normalized URL (or adds it with host and path as name) and selects it. */
export async function changeServer(url: string): Promise<void> {
    const parsed = parseServerUrl(url);
    // The reason is a code, never the URL itself.
    if (!parsed.ok) throw new Error(`Invalid server URL (${parsed.reason})`);
    await session.init();
    const servers = await session.listServers();
    const server = servers.find((s) => s.url === parsed.url)
        ?? await session.addServer(serverDisplayName(parsed.url), parsed.url);
    await session.selectServer(server.id);
}

export async function resetServerToDefault(): Promise<void> {
    await changeServer(DEFAULT_SERVER_URL);
}

/** Connection test before confirming a server (issue #3). Invalid input: false, no request. */
export async function testServer(url: string): Promise<boolean> {
    const parsed = parseServerUrl(url);
    if (!parsed.ok) return false;
    return ping({ baseUrl: parsed.url, headers: headersForServer(parsed.url) }, TEST_TIMEOUT_MS);
}
