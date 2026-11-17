import type { RegistryRepository } from '../ports';
import { ServerExistsError } from '../ports';

// NOTE: These URLs are intentionally duplicated from src/api/apiClient.ts, because they will
// later be removed from there. Do not import from src/api.
export const DEFAULT_SERVERS = [
    { name: 'HS Esslingen (default)', url: 'https://www2.hs-esslingen.de/~chkohl/chat' },
    { name: 'Reimplementation (backup)', url: 'https://api.chat.throin.de' },
] as const;

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
