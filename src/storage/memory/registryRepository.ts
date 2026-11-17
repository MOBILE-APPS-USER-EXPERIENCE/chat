import type { RegistryRepository } from '../ports';
import { AccountExistsError as AccountExists, ServerExistsError as ServerExists } from '../ports';
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
        return [...this.state.servers.values()].map(server => ({ ...server }));
    }

    async addServer(name: string, url: string) {
        const normalized = url.trim().replace(/\/+$/, '');
        if ([...this.state.servers.values()].some(server => server.url === normalized)) {
            throw new ServerExists();
        }
        const server = { id: this.deps.newId(), name, url: normalized };
        this.state.servers.set(server.id, { ...server });
        return { ...server };
    }

    async listAccounts() {
        return [...this.state.accounts.values()].map(account => ({ ...account }));
    }

    async findAccount(serverId: string, userid: string) {
        const account = [...this.state.accounts.values()]
            .find(value => value.serverId === serverId && value.userid.toLowerCase() === userid.toLowerCase());
        return account ? { ...account } : null;
    }

    async createAccount(input: Omit<AccountEntry, 'id' | 'createdAt' | 'status'>) {
        if (await this.findAccount(input.serverId, input.userid)) throw new AccountExists();
        const account: AccountEntry = {
            ...input,
            id: this.deps.newId(),
            status: 'active',
            createdAt: this.deps.now(),
        };
        this.state.accounts.set(account.id, { ...account });
        return { ...account };
    }

    async updateAccount(id: string, patch: Partial<Omit<AccountEntry, 'id' | 'serverId' | 'userid'>>) {
        const account = this.state.accounts.get(id);
        if (!account) throw new Error(`Unknown account ${id}`);
        Object.assign(account, patch);
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
}

export { AccountExists as AccountExistsError, ServerExists as ServerExistsError };
