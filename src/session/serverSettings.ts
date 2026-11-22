import { ping } from '../api/connectivityService';
import { DEFAULT_SERVER_URL } from '../storage/registry/defaultServers';
import { normalizeServerUrl } from '../storage/registryRules';
import { session } from './index';
import { NoServerSelectedError } from './ports';
import { headersForServer } from './serverHeaders';

const TEST_TIMEOUT_MS = 3000;

function hostName(url: string): string {
    try {
        return new URL(url).host || url;
    } catch {
        return url;   // not parseable: use the URL itself as the name
    }
}

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

/** Finds the server by normalized URL (or adds it with the host as name) and selects it. */
export async function changeServer(url: string): Promise<void> {
    await session.init();
    const normalized = normalizeServerUrl(url);
    const servers = await session.listServers();
    const server = servers.find((s) => s.url === normalized)
        ?? await session.addServer(hostName(normalized), normalized);
    await session.selectServer(server.id);
}

export async function resetServerToDefault(): Promise<void> {
    await changeServer(DEFAULT_SERVER_URL);
}

/** Connection test before confirming a server (issue #3). */
export async function testServer(url: string): Promise<boolean> {
    const baseUrl = normalizeServerUrl(url);
    if (!baseUrl) return false;
    return ping({ baseUrl, headers: headersForServer(baseUrl) }, TEST_TIMEOUT_MS);
}
