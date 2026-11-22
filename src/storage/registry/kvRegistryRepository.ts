import type { KeyValueStore, RegistryRepository } from '../ports';
import {
    AccountExistsError, RegistryCorruptError, RegistryVersionError, ServerExistsError,
} from '../ports';
import {
    applyAccountPatch, buildAccount, copyAccount, copyServer, normalizeServerUrl, sameUserid,
} from '../registryRules';
import type { AccountEntry, ServerEntry } from '../types';

/** KV key of the persisted registry document. */
export const REGISTRY_KEY = 'registry.v1';

type PersistedRegistry = {
    version: 1;
    activeAccountId: string | null;
    servers: ServerEntry[];
    accounts: AccountEntry[];
};

function emptyRegistry(): PersistedRegistry {
    return { version: 1, activeAccountId: null, servers: [], accounts: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptional(value: unknown, type: 'string' | 'number'): boolean {
    return value === undefined || typeof value === type;
}

function isServerEntry(value: unknown): value is ServerEntry {
    return isRecord(value)
        && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.url === 'string';
}

function isAccountEntry(value: unknown): value is AccountEntry {
    return isRecord(value)
        && typeof value.id === 'string' && typeof value.serverId === 'string' && typeof value.userid === 'string'
        && (value.status === 'active' || value.status === 'server_deleted')
        && typeof value.createdAt === 'number'
        && isOptional(value.userHash, 'string') && isOptional(value.nickname, 'string')
        && isOptional(value.lastLoginAt, 'number');
}

function corrupt(reason: string): RegistryCorruptError {
    // Never include stored data in the message, only the rule that failed.
    return new RegistryCorruptError(`Stored registry is invalid: ${reason}`);
}

function parseRegistry(raw: unknown): PersistedRegistry {
    if (!isRecord(raw)) throw corrupt('not an object');
    if (typeof raw.version !== 'number') throw corrupt('version missing');
    if (raw.version !== 1) throw new RegistryVersionError(`Unknown registry version ${raw.version}`);
    if (raw.activeAccountId !== null && typeof raw.activeAccountId !== 'string') {
        throw corrupt('activeAccountId must be a string or null');
    }
    if (!Array.isArray(raw.servers) || !raw.servers.every(isServerEntry)) throw corrupt('invalid servers');
    if (!Array.isArray(raw.accounts) || !raw.accounts.every(isAccountEntry)) throw corrupt('invalid accounts');
    return { version: 1, activeAccountId: raw.activeAccountId, servers: raw.servers, accounts: raw.accounts };
}

/**
 * Registry persisted as one JSON document under `registry.v1`.
 *
 * - No cache: every call loads from the KV store; every mutation is read-modify-write.
 * - Mutations of one instance run through a promise queue.
 * - Known limitation: the queue is per instance. Two instances or browser tabs on the same
 *   storage can still race (lost update). Re-reading before every write keeps the window small.
 */
export class KvRegistryRepository implements RegistryRepository {
    /** Tail of the mutation queue. Never rejects, so a failed mutation cannot poison it. */
    private queue: Promise<void> = Promise.resolve();

    constructor(
        private readonly kv: KeyValueStore,
        private readonly deps: { now: () => number; newId: () => string },
    ) { }

    async listServers() {
        return (await this.load()).servers.map(copyServer);
    }

    async addServer(name: string, url: string) {
        const trimmedName = name.trim();
        const normalized = normalizeServerUrl(url);
        if (!trimmedName) throw new Error('Server name must not be empty');
        if (!normalized) throw new Error('Server URL must not be empty');
        return this.mutate(doc => {
            if (doc.servers.some(server => server.url === normalized)) {
                throw new ServerExistsError('A server with this URL already exists');
            }
            const server: ServerEntry = { id: this.deps.newId(), name: trimmedName, url: normalized };
            doc.servers.push(server);
            return copyServer(server);
        });
    }

    async listAccounts() {
        return (await this.load()).accounts.map(copyAccount);
    }

    async findAccount(serverId: string, userid: string) {
        const account = (await this.load()).accounts
            .find(value => value.serverId === serverId && sameUserid(value.userid, userid));
        return account ? copyAccount(account) : null;
    }

    async createAccount(input: Parameters<RegistryRepository['createAccount']>[0]) {
        return this.mutate(doc => {
            if (!doc.servers.some(server => server.id === input.serverId)) {
                throw new Error(`Unknown server ${input.serverId}`);
            }
            if (doc.accounts.some(a => a.serverId === input.serverId && sameUserid(a.userid, input.userid))) {
                throw new AccountExistsError('This account already exists on the server');
            }
            const account = buildAccount(input, this.deps.newId(), this.deps.now());
            doc.accounts.push(account);
            return copyAccount(account);
        });
    }

    async updateAccount(id: string, patch: Parameters<RegistryRepository['updateAccount']>[1]) {
        return this.mutate(doc => {
            const account = doc.accounts.find(value => value.id === id);
            if (!account) throw new Error(`Unknown account ${id}`);
            applyAccountPatch(account, patch);
        });
    }

    async removeAccount(id: string) {
        return this.mutate(doc => {
            doc.accounts = doc.accounts.filter(account => account.id !== id);
            if (doc.activeAccountId === id) doc.activeAccountId = null;
        });
    }

    async getActiveAccountId() {
        return (await this.load()).activeAccountId;
    }

    async setActiveAccountId(id: string | null) {
        return this.mutate(doc => {
            if (id !== null && !doc.accounts.some(account => account.id === id)) {
                throw new Error(`Unknown account ${id}`);
            }
            doc.activeAccountId = id;
        });
    }

    private async load(): Promise<PersistedRegistry> {
        const raw = await this.kv.getJson<unknown>(REGISTRY_KEY);
        return raw === null ? emptyRegistry() : parseRegistry(raw);
    }

    /**
     * Read-modify-write on a freshly parsed working copy. `apply` runs before any write, so a
     * throw (validation, duplicate, unknown id) or a failing load never touches the stored data.
     */
    private mutate<T>(apply: (doc: PersistedRegistry) => T): Promise<T> {
        const run = this.queue.then(async () => {
            const doc = await this.load();
            const result = apply(doc);
            await this.kv.setJson(REGISTRY_KEY, doc);
            return result;
        });
        // The caller still sees the rejection through `run`; the queue itself must always settle OK.
        this.queue = run.then(() => undefined, () => undefined);
        return run;
    }
}
