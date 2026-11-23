import type { RegistryRepository } from '../ports';
import { AccountExistsError, ServerExistsError } from '../ports';
import {
    applyAccountPatch, buildAccount, copyAccount, copyServer, normalizeServerUrl, sameUserid,
} from '../registryRules';
import type { AccountEntry, ServerEntry } from '../types';

type RegistryState = {
    servers: Map<string, ServerEntry>;
    accounts: Map<string, AccountEntry>;
    activeAccountId: string | null;
};

export class MemoryRegistryRepository implements RegistryRepository {
    private readonly state: RegistryState = {
        servers: new Map(),
        accounts: new Map(),
        activeAccountId: null,
    };

    constructor(private readonly deps: { now: () => number; newId: () => string }) { }

    async listServers() {
        return [...this.state.servers.values()].map(copyServer);
    }

    async addServer(name: string, url: string) {
        const trimmedName = name.trim();
        const normalized = normalizeServerUrl(url);
        if (!trimmedName) throw new Error('Server name must not be empty');
        if (!normalized) throw new Error('Server URL must not be empty');
        if ([...this.state.servers.values()].some(server => server.url === normalized)) {
            throw new ServerExistsError('A server with this URL already exists');
        }
        const server: ServerEntry = { id: this.deps.newId(), name: trimmedName, url: normalized };
        this.state.servers.set(server.id, server);
        return copyServer(server);
    }

    async listAccounts() {
        return [...this.state.accounts.values()].map(copyAccount);
    }

    async findAccount(serverId: string, userid: string) {
        const account = this.lookup(serverId, userid);
        return account ? copyAccount(account) : null;
    }

    async createAccount(input: Parameters<RegistryRepository['createAccount']>[0]) {
        if (!this.state.servers.has(input.serverId)) throw new Error(`Unknown server ${input.serverId}`);
        // Synchronous lookup on purpose: no await between check and insert.
        if (this.lookup(input.serverId, input.userid)) {
            throw new AccountExistsError('This account already exists on the server');
        }
        const account = buildAccount(input, this.deps.newId(), this.deps.now());
        this.state.accounts.set(account.id, account);
        return copyAccount(account);
    }

    async updateAccount(id: string, patch: Parameters<RegistryRepository['updateAccount']>[1]) {
        const account = this.state.accounts.get(id);
        if (!account) throw new Error(`Unknown account ${id}`);
        applyAccountPatch(account, patch);
    }

    async removeAccount(id: string) {
        this.state.accounts.delete(id);
        if (this.state.activeAccountId === id) this.state.activeAccountId = null;
    }

    async getActiveAccountId() {
        return this.state.activeAccountId;
    }

    async setActiveAccountId(id: string | null) {
        if (id !== null && !this.state.accounts.has(id)) throw new Error(`Unknown account ${id}`);
        this.state.activeAccountId = id;
    }

    private lookup(serverId: string, userid: string): AccountEntry | undefined {
        return [...this.state.accounts.values()]
            .find(value => value.serverId === serverId && sameUserid(value.userid, userid));
    }
}
