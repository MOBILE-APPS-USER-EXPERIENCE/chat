import type { ApiContext } from '../api/apiClient';
import type { KeyValueStore, RegistryRepository, SecretStore } from '../storage/ports';
import { SecretKeys } from '../storage/ports';
import { DEFAULT_SERVERS, ensureServers } from '../storage/registry/defaultServers';
import type { AccountEntry, ServerEntry } from '../storage/types';
import type { AuthApi, SessionState } from './ports';
import { NoServerSelectedError, NotSignedInError, StaleAccountError } from './ports';

export const SELECTED_SERVER_KEY = 'session.selectedServerId';
const DEFAULT_REMOTE_TIMEOUT_MS = 5000;

export type SessionDeps = {
    registry: RegistryRepository;
    secrets: SecretStore;
    kv: KeyValueStore;
    authApi: AuthApi;
    setActiveContext: (ctx: ApiContext | null) => void;
    headersForServer: (url: string) => Record<string, string>;
    now: () => number;
    onAccountRemoved?: (accountId: string) => Promise<void>;   // later: destroy the account DB and files
    legacyCleanup?: () => Promise<void>;                       // removes the old AsyncStorage keys
    remoteTimeoutMs?: number;                                  // default 5000, used for best-effort logout
};

type AuthResult = { token: string; hash: string };

function withAdminKey(ctx: ApiContext, adminKey: string | undefined): ApiContext {
    const next: ApiContext = { ...ctx };
    if (adminKey === undefined) delete next.adminKey;
    else next.adminKey = adminKey;
    return next;
}

/**
 * Servers, accounts and the signed-in session. No Expo/React/AsyncStorage imports: every
 * dependency is injected. All mutating operations run through one promise queue.
 */
export class SessionService {
    private state: SessionState = { status: 'initializing' };
    private context: ApiContext | null = null;
    private readonly listeners = new Set<() => void>();
    /** Tail of the operation queue. Never rejects, so a failed operation cannot poison it. */
    private queue: Promise<void> = Promise.resolve();
    private initPromise: Promise<void> | undefined;

    constructor(private readonly deps: SessionDeps) { }

    // Arrow properties: they are passed unbound to useSyncExternalStore.
    readonly getState = (): SessionState => this.state;

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    /** Idempotent. Concurrent calls share one run; a failed run can be retried. */
    init(): Promise<void> {
        if (!this.initPromise) {
            const run = this.enqueue(() => this.runInit());
            this.initPromise = run;
            void run.catch(() => {
                if (this.initPromise === run) this.initPromise = undefined;
            });
        }
        return this.initPromise;
    }

    listServers(): Promise<ServerEntry[]> {
        return this.deps.registry.listServers();
    }

    /** No selection, no ping. */
    addServer(name: string, url: string): Promise<ServerEntry> {
        return this.deps.registry.addServer(name, url);
    }

    selectServer(serverId: string): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            if (state.status === 'signed_in') throw new Error('Log out before switching the server');
            const server = (await this.deps.registry.listServers()).find((s) => s.id === serverId);
            if (!server) throw new Error('Unknown server');
            await this.deps.kv.setJson(SELECTED_SERVER_KEY, server.id);
            if (state.status === 'signed_out' && state.selectedServer?.id !== server.id) {
                this.setState({ status: 'signed_out', selectedServer: server });
            }
        });
    }

    login(userid: string, password: string): Promise<void> {
        return this.enqueue(() => this.signIn(
            userid, (ctx) => this.deps.authApi.login(ctx, userid.trim(), password), false,
        ));
    }

    register(userid: string, password: string, nickname: string, fullname: string): Promise<void> {
        return this.enqueue(() => this.signIn(
            userid, (ctx) => this.deps.authApi.register(ctx, userid.trim(), password, nickname, fullname), true, nickname,
        ));
    }

    /**
     * Works offline: the remote call is best effort. If it fails (offline, timeout), the token
     * stays valid on the server until it is invalidated some other way.
     */
    logout(): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            if (state.status !== 'signed_in') return;
            const ctx = this.context;
            if (ctx) await this.ignore(() => this.deps.authApi.logout(ctx, { timeoutMs: this.remoteTimeoutMs }));
            await this.deleteSecrets(state.account.id);
            await this.deps.registry.setActiveAccountId(null);
            this.publishContext(null);
            this.setState({ status: 'signed_out', selectedServer: state.server });
        });
    }

    deregister(): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            const ctx = this.context;
            if (state.status !== 'signed_in' || !ctx) throw new NotSignedInError();
            // Remote first: if it fails, nothing local changes.
            await this.deps.authApi.deregister(ctx);
            await this.purgeAccount(state.account.id);
            this.publishContext(null);
            this.setState({ status: 'signed_out', selectedServer: state.server });
        });
    }

    /** "Delete local data" for stale accounts. The active account must log out first. */
    discardAccount(accountId: string): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            if (state.status === 'signed_in' && state.account.id === accountId) {
                throw new Error('Log out before discarding the active account');
            }
            const accounts = await this.deps.registry.listAccounts();
            if (!accounts.some((a) => a.id === accountId)) throw new Error('Unknown account');
            await this.purgeAccount(accountId);
        });
    }

    unlockAdmin(key: string): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            const ctx = this.context;
            if (state.status !== 'signed_in' || !ctx) throw new NotSignedInError();
            if (!key) throw new Error('Admin key must not be empty');
            await this.deps.secrets.set(SecretKeys.adminKey(state.account.id), key);
            this.publishContext(withAdminKey(ctx, key));
            this.setState({ ...state, adminUnlocked: true });
        });
    }

    lockAdmin(): Promise<void> {
        return this.enqueue(async () => {
            const state = this.state;
            const ctx = this.context;
            if (state.status !== 'signed_in' || !ctx) throw new NotSignedInError();
            await this.deps.secrets.delete(SecretKeys.adminKey(state.account.id));
            this.publishContext(withAdminKey(ctx, undefined));
            if (state.adminUnlocked) this.setState({ ...state, adminUnlocked: false });
        });
    }

    // ---- internals -------------------------------------------------------------------------

    private get remoteTimeoutMs(): number {
        return this.deps.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.queue.then(operation);
        this.queue = run.then(() => undefined, () => undefined);
        return run;
    }

    private setState(next: SessionState): void {
        this.state = next;
        for (const listener of this.listeners) listener();
    }

    private publishContext(ctx: ApiContext | null): void {
        this.context = ctx;
        this.deps.setActiveContext(ctx);
    }

    private buildContext(server: ServerEntry, token: string, adminKey?: string): ApiContext {
        const ctx: ApiContext = {
            baseUrl: server.url,
            token,
            headers: this.deps.headersForServer(server.url),
        };
        if (adminKey !== undefined) ctx.adminKey = adminKey;
        return ctx;
    }

    /** Best-effort cleanup step: failures must not mask the error the caller is about to rethrow. */
    private async ignore(operation: () => Promise<unknown>): Promise<void> {
        try {
            await operation();
        } catch {
            // Intentionally swallowed, see the doc comment.
        }
    }

    private async deleteSecrets(accountId: string): Promise<void> {
        await this.deps.secrets.delete(SecretKeys.token(accountId));
        await this.deps.secrets.delete(SecretKeys.adminKey(accountId));
    }

    private async purgeAccount(accountId: string): Promise<void> {
        await this.deleteSecrets(accountId);
        await this.deps.registry.removeAccount(accountId);
        await this.deps.onAccountRemoved?.(accountId);
    }

    private async runInit(): Promise<void> {
        const { registry } = this.deps;
        await this.ignore(async () => this.deps.legacyCleanup?.());
        await ensureServers(registry, DEFAULT_SERVERS);

        const servers = await registry.listServers();
        const selected = await this.resolveSelectedServer(servers);

        const activeId = await registry.getActiveAccountId();
        if (activeId !== null) {
            if (await this.restore(activeId, servers)) return;
            await registry.setActiveAccountId(null);
        }
        this.setState({ status: 'signed_out', selectedServer: selected });
    }

    private async resolveSelectedServer(servers: ServerEntry[]): Promise<ServerEntry | null> {
        const id = await this.deps.kv.getJson<unknown>(SELECTED_SERVER_KEY);
        return servers.find((s) => s.id === id) ?? servers[0] ?? null;
    }

    /** No network, no token validation. Returns false when the stored session is unusable. */
    private async restore(activeId: string, servers: ServerEntry[]): Promise<boolean> {
        const { registry, secrets } = this.deps;
        const account = (await registry.listAccounts()).find((a) => a.id === activeId);

        if (!account || account.status === 'server_deleted') return false;
        const server = servers.find((s) => s.id === account.serverId);
        if (!server) return false;
        const token = await secrets.get(SecretKeys.token(account.id));
        if (!token) return false;

        const adminKey = (await secrets.get(SecretKeys.adminKey(account.id))) ?? undefined;
        this.publishContext(this.buildContext(server, token, adminKey));
        this.setState({ status: 'signed_in', account, server, adminUnlocked: adminKey !== undefined });
        return true;
    }

    private async signIn(
        userid: string,
        authenticate: (ctx: ApiContext) => Promise<AuthResult>,
        replaceExisting: boolean,
        nickname?: string,
    ): Promise<void> {
        const { registry, secrets, kv, authApi } = this.deps;
        const state = this.state;
        if (state.status === 'signed_in') throw new Error('Already signed in');

        // While initializing, no server is selected yet.
        const server = state.status === 'signed_out' ? state.selectedServer : null;
        if (!server) throw new NoServerSelectedError();

        const trimmed = userid.trim();
        // No token, and not the active context until everything succeeded.
        const authCtx: ApiContext = { baseUrl: server.url, headers: this.deps.headersForServer(server.url) };
        const result = await authenticate(authCtx);   // API errors propagate, nothing is written

        const sessionCtx = this.buildContext(server, result.token);
        let tokenKey: string | undefined;
        let activated = false;

        try {
            const existing = await registry.findAccount(server.id, trimmed);
            const loginAt = this.deps.now();

            let account: AccountEntry;
            if (replaceExisting) {
                account = await this.replaceAccount(existing, result, server, trimmed, nickname, loginAt);
            } else if (existing) {
                account = await this.updateAccount(existing, result, loginAt);
            } else {
                account = await registry.createAccount({
                    serverId: server.id, userid: trimmed, userHash: result.hash, lastLoginAt: loginAt,
                });
            }

            tokenKey = SecretKeys.token(account.id);
            await secrets.set(tokenKey, result.token);
            await registry.setActiveAccountId(account.id);
            activated = true;
            await kv.setJson(SELECTED_SERVER_KEY, server.id);
            this.publishContext(sessionCtx);
            this.setState({ status: 'signed_in', account, server, adminUnlocked: false });
        } catch (error) {
            // Roll back: the server-side token must not outlive a failed local sign-in.
            await this.ignore(() => authApi.logout(sessionCtx, { timeoutMs: this.remoteTimeoutMs }));
            if (tokenKey !== undefined) {
                const key = tokenKey;
                await this.ignore(() => secrets.delete(key));
            }
            if (activated) await this.ignore(() => registry.setActiveAccountId(null));
            throw error;
        }
    }


    private async replaceAccount(existing: AccountEntry | null, result: AuthResult, server: ServerEntry, trimmedId: string, nickname: string | undefined, loginAt: number): Promise<AccountEntry> {
        const { registry } = this.deps;

        if (existing) await this.purgeAccount(existing.id);
        return registry.createAccount({
            serverId: server.id, userid: trimmedId, userHash: result.hash, nickname, lastLoginAt: loginAt,
        });
    }

    private async updateAccount(existing: AccountEntry, result: AuthResult, loginAt: number): Promise<AccountEntry> {
        const { registry } = this.deps;
        if (existing.userHash !== undefined && existing.userHash !== result.hash) {
            throw new StaleAccountError(existing.id, 'The local account belongs to a different server user');
        }
        await registry.updateAccount(existing.id, { status: 'active', userHash: result.hash, lastLoginAt: loginAt });
        return { ...existing, status: 'active', userHash: result.hash, lastLoginAt: loginAt };
    }
}
