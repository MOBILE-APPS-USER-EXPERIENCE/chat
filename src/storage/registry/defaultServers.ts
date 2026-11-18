import type { RegistryRepository } from '../ports';
import { ServerExistsError } from '../ports';

// These URLs used to be duplicated in src/api/apiClient.ts; they now live only here.
export const DEFAULT_SERVERS = [
    { name: 'HS Esslingen (default)', url: 'https://www2.hs-esslingen.de/~chkohl/chat' },
    { name: 'Reimplementation (backup)', url: 'https://api.chat.throin.de' },
] as const;

/** The HS default server. Only this server gets the X-Access-Token header. */
export const DEFAULT_SERVER_URL = DEFAULT_SERVERS[0].url;

/** Idempotent: adds missing servers, never renames or removes existing ones. */
export async function ensureServers(
    registry: RegistryRepository,
    servers: readonly { name: string; url: string }[],
): Promise<void> {
    await Promise.all(servers.map(async (server) => {
        try {
            await registry.addServer(server.name, server.url);
        } catch (error) {
            // A server with the same normalized URL already exists: that is the desired state.
            if (!(error instanceof ServerExistsError)) throw error;
        }
    }));
}
