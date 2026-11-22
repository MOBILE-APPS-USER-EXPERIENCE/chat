import type { ApiContext } from '../../api/apiClient';
import { ApiError } from '../../api/apiClient';
import { JsonKeyValueStore } from '../../storage/kv/jsonKeyValueStore';
import { MemoryRegistryRepository, MemorySecretStore, MemoryStringBackend } from '../../storage/memory';
import { SecretKeys } from '../../storage/ports';
import type { AuthApi, SessionState } from '../ports';
import { NoServerSelectedError, NotSignedInError, StaleAccountError } from '../ports';
import { SessionService } from '../sessionService';

type Method = 'login' | 'register' | 'logout' | 'deregister';
type Call = { method: Method; ctx: ApiContext; userid?: string; options?: { timeoutMs?: number } };

class FakeAuthApi implements AuthApi {
    readonly calls: Call[] = [];
    /** One-shot failures: consumed by the next call of that method. */
    readonly failures: Partial<Record<Method, Error>> = {};
    result = { token: 'tok-1', hash: 'hash-1' };

    callsOf(method: Method) { return this.calls.filter((c) => c.method === method); }

    private record(call: Call): void {
        this.calls.push(call);
        const failure = this.failures[call.method];
        if (failure) {
            delete this.failures[call.method];
            throw failure;
        }
    }

    async login(ctx: ApiContext, userid: string) {
        this.record({ method: 'login', ctx, userid });
        return { ...this.result };
    }
    async register(ctx: ApiContext, userid: string) {
        this.record({ method: 'register', ctx, userid });
        return { ...this.result };
    }
    async logout(ctx: ApiContext, options?: { timeoutMs?: number }) {
        this.record({ method: 'logout', ctx, options });
    }
    async deregister(ctx: ApiContext) {
        this.record({ method: 'deregister', ctx });
    }
}

function setup() {
    let counter = 0;
    let time = 5000;
    const registry = new MemoryRegistryRepository({ now: () => 1000, newId: () => `id-${++counter}` });
    const secrets = new MemorySecretStore();
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    const authApi = new FakeAuthApi();
    const contexts: (ApiContext | null)[] = [];
    const onAccountRemoved = jest.fn<Promise<void>, [string]>(async () => undefined);
    const legacyCleanup = jest.fn<Promise<void>, []>(async () => undefined);
    const make = () => new SessionService({
        registry, secrets, kv, authApi,
        setActiveContext: (ctx) => { contexts.push(ctx); },
        headersForServer: (url) => ({ 'X-Test': url }),
        now: () => time,
        onAccountRemoved,
        legacyCleanup,
    });
    return {
        registry, secrets, kv, authApi, contexts, onAccountRemoved, legacyCleanup, make,
        setTime: (value: number) => { time = value; },
        lastContext: () => contexts[contexts.length - 1],
    };
}
type Ctx = ReturnType<typeof setup>;

function signedIn(state: SessionState) {
    if (state.status !== 'signed_in') throw new Error(`expected signed_in, got ${state.status}`);
    return state;
}

async function loggedIn(userid = 'Alice') {
    const t = setup();
    const session = t.make();
    await session.init();
    await session.login(userid, 'pw');
    return { t, session, state: signedIn(session.getState()) };
}

/** Seeds an active account with a token on a custom server. */
async function seedActive(t: Ctx) {
    const server = await t.registry.addServer('Own', 'https://own.example');
    const account = await t.registry.createAccount({ serverId: server.id, userid: 'Alice', userHash: 'h' });
    await t.registry.setActiveAccountId(account.id);
    await t.secrets.set(SecretKeys.token(account.id), 'tok-seed');
    return { server, account };
}

describe('SessionService.init', () => {
    it('gives an empty registry both default servers, signed_out, first server selected, no API calls, no context', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const servers = await t.registry.listServers();
        expect(servers).toHaveLength(2);
        expect(session.getState()).toEqual({ status: 'signed_out', selectedServer: servers[0] });
        expect(t.authApi.calls).toEqual([]);
        expect(t.contexts).toEqual([]);
    });

    it('restores an active account with a token as signed_in with the context set and no API calls', async () => {
        const t = setup();
        const { server, account } = await seedActive(t);
        const session = t.make();
        await session.init();
        expect(session.getState()).toEqual({ status: 'signed_in', account, server, adminUnlocked: false });
        expect(t.contexts).toEqual([{ baseUrl: 'https://own.example', token: 'tok-seed', headers: { 'X-Test': 'https://own.example' } }]);
        expect(t.authApi.calls).toEqual([]);
    });

    const cases: [string, (t: Ctx, accountId: string) => Promise<void>][] = [
        ['a missing token', async (t, id) => { await t.secrets.delete(SecretKeys.token(id)); }],
        ['a server_deleted account', async (t, id) => { await t.registry.updateAccount(id, { status: 'server_deleted' }); }],
        ['an unknown active id', async (t) => { jest.spyOn(t.registry, 'getActiveAccountId').mockResolvedValue('ghost'); }],
    ];
    it.each(cases)('with %s clears the active id and gives signed_out', async (_label, arrange) => {
        const t = setup();
        const { account } = await seedActive(t);
        await arrange(t, account.id);
        const spy = jest.spyOn(t.registry, 'setActiveAccountId');
        const session = t.make();
        await session.init();
        expect(spy).toHaveBeenCalledWith(null);
        expect(session.getState().status).toBe('signed_out');
        expect(t.contexts).toEqual([]);
    });

    it('is idempotent and concurrent calls run once', async () => {
        const t = setup();
        const session = t.make();
        await Promise.all([session.init(), session.init()]);
        await session.init();
        expect(t.legacyCleanup).toHaveBeenCalledTimes(1);
    });

    it('lets a second instance over the same stores restore the session', async () => {
        const { t, state } = await loggedIn();
        const second = t.make();
        await second.init();
        const restored = signedIn(second.getState());
        expect(restored.account.id).toBe(state.account.id);
        expect(t.lastContext()).toMatchObject({ token: 'tok-1', baseUrl: state.server.url });
    });
});

describe('SessionService.selectServer', () => {
    it('persists the server and survives a new instance', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const [, second] = await t.registry.listServers();
        await session.selectServer(second.id);
        expect(session.getState()).toEqual({ status: 'signed_out', selectedServer: second });
        const again = t.make();
        await again.init();
        expect(again.getState()).toEqual({ status: 'signed_out', selectedServer: second });
    });

    it('throws for an unknown id', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        await expect(session.selectServer('nope')).rejects.toThrow('Unknown server');
    });

    it('throws while signed in', async () => {
        const { t, session } = await loggedIn();
        const [, other] = await t.registry.listServers();
        await expect(session.selectServer(other.id)).rejects.toThrow('Log out');
    });
});

describe('SessionService.login', () => {
    it('creates a new account, stores the token, sets the active id and the context; the auth ctx has no token', async () => {
        const { t, state } = await loggedIn();
        const login = t.authApi.callsOf('login')[0];
        expect(login.ctx).toEqual({ baseUrl: state.server.url, headers: { 'X-Test': state.server.url } });
        expect(login.ctx).not.toHaveProperty('token');
        expect(state.account).toMatchObject({ userid: 'Alice', userHash: 'hash-1', lastLoginAt: 5000, status: 'active' });
        expect(await t.secrets.get(SecretKeys.token(state.account.id))).toBe('tok-1');
        expect(await t.registry.getActiveAccountId()).toBe(state.account.id);
        expect(t.lastContext()).toEqual({ baseUrl: state.server.url, token: 'tok-1', headers: { 'X-Test': state.server.url } });
    });

    it('does not set the context before the API call succeeded', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        t.authApi.failures.login = new ApiError(455, 'Wrong password');
        await expect(session.login('Alice', 'bad')).rejects.toBeInstanceOf(ApiError);
        expect(t.contexts).toEqual([]);
    });

    it('reuses an existing account (case-insensitive userid) and updates lastLoginAt', async () => {
        const { t, session, state } = await loggedIn();
        await session.logout();
        t.setTime(9000);
        await session.login('ALICE', 'pw');
        const again = signedIn(session.getState());
        expect(again.account.id).toBe(state.account.id);
        expect(await t.registry.listAccounts()).toEqual([expect.objectContaining({ userid: 'Alice', lastLoginAt: 9000 })]);
    });

    it('reactivates a server_deleted account with the same hash', async () => {
        const { t, session, state } = await loggedIn();
        await session.logout();
        await t.registry.updateAccount(state.account.id, { status: 'server_deleted' });
        await session.login('Alice', 'pw');
        expect(signedIn(session.getState()).account.id).toBe(state.account.id);
        expect((await t.registry.listAccounts())[0].status).toBe('active');
    });

    it('with a different hash throws StaleAccountError, logs out remotely with the new token and writes nothing', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const [server] = await t.registry.listServers();
        const stale = await t.registry.createAccount({ serverId: server.id, userid: 'Alice', userHash: 'old-hash' });
        const error = await session.login('Alice', 'pw').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(StaleAccountError);
        expect((error as StaleAccountError).accountId).toBe(stale.id);
        expect(t.authApi.callsOf('logout')[0].ctx.token).toBe('tok-1');
        expect(await t.secrets.get(SecretKeys.token(stale.id))).toBeNull();
        expect(await t.registry.getActiveAccountId()).toBeNull();
        expect(await t.registry.findAccount(server.id, 'Alice')).toEqual(stale);
        expect(session.getState().status).toBe('signed_out');
    });

    it('creates a new account with a new id after discardAccount of a stale one', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const [server] = await t.registry.listServers();
        const stale = await t.registry.createAccount({ serverId: server.id, userid: 'Alice', userHash: 'old-hash' });
        await expect(session.login('Alice', 'pw')).rejects.toBeInstanceOf(StaleAccountError);
        await session.discardAccount(stale.id);
        await session.login('Alice', 'pw');
        const account = signedIn(session.getState()).account;
        expect(account.id).not.toBe(stale.id);
        expect(account.userHash).toBe('hash-1');
    });

    it('rethrows an API error and writes nothing', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const failure = new ApiError(455, 'Wrong password');
        t.authApi.failures.login = failure;
        await expect(session.login('Alice', 'bad')).rejects.toBe(failure);
        expect(await t.registry.listAccounts()).toEqual([]);
        expect(await t.registry.getActiveAccountId()).toBeNull();
        expect(session.getState().status).toBe('signed_out');
    });

    it('after a failure behind the API success: best-effort remote logout and no leftover token secret', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        jest.spyOn(t.registry, 'setActiveAccountId').mockRejectedValueOnce(new Error('disk full'));
        await expect(session.login('Alice', 'pw')).rejects.toThrow('disk full');
        expect(t.authApi.callsOf('logout')[0].ctx.token).toBe('tok-1');
        const [account] = await t.registry.listAccounts();
        expect(await t.secrets.get(SecretKeys.token(account.id))).toBeNull();
        expect(session.getState().status).toBe('signed_out');
        expect(t.contexts).toEqual([]);
    });

    it('without a selected server throws NoServerSelectedError', async () => {
        const t = setup();
        const session = t.make();   // init not run: nothing selected
        await expect(session.login('Alice', 'pw')).rejects.toBeInstanceOf(NoServerSelectedError);
        expect(t.authApi.calls).toEqual([]);
    });
});

describe('SessionService.register', () => {
    it('creates a new account with the nickname', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        await session.register('Bob', 'pw', 'Bobby', 'Bob Builder');
        const { account } = signedIn(session.getState());
        expect(account).toMatchObject({ userid: 'Bob', nickname: 'Bobby', userHash: 'hash-1' });
        expect(t.authApi.callsOf('register')).toHaveLength(1);
        expect(await t.secrets.get(SecretKeys.token(account.id))).toBe('tok-1');
    });

    it('over an existing local account purges the old one and creates a new id', async () => {
        const { t, session, state } = await loggedIn('Alice');
        await session.logout();
        await t.secrets.set(SecretKeys.adminKey(state.account.id), 'old-key');
        await session.register('alice', 'pw', 'Al', 'Alice A');
        expect(await t.secrets.get(SecretKeys.adminKey(state.account.id))).toBeNull();
        expect(t.onAccountRemoved).toHaveBeenCalledWith(state.account.id);
        const fresh = signedIn(session.getState()).account;
        expect(fresh.id).not.toBe(state.account.id);
        expect(await t.registry.listAccounts()).toHaveLength(1);
    });
});

describe('SessionService.logout', () => {
    it('calls the remote logout with the token and a timeout, clears secrets, active id and context, keeps account and server', async () => {
        const { t, session, state } = await loggedIn();
        await session.unlockAdmin('adm');
        await session.logout();
        const call = t.authApi.callsOf('logout')[0];
        expect(call.ctx.token).toBe('tok-1');
        expect(call.options?.timeoutMs).toBe(5000);
        expect(await t.secrets.get(SecretKeys.token(state.account.id))).toBeNull();
        expect(await t.secrets.get(SecretKeys.adminKey(state.account.id))).toBeNull();
        expect(await t.registry.getActiveAccountId()).toBeNull();
        expect(t.lastContext()).toBeNull();
        expect(await t.registry.listAccounts()).toHaveLength(1);
        expect(session.getState()).toEqual({ status: 'signed_out', selectedServer: state.server });
    });

    it('still completes when the remote call rejects', async () => {
        const { t, session } = await loggedIn();
        t.authApi.failures.logout = new Error('offline');
        await expect(session.logout()).resolves.toBeUndefined();
        expect(session.getState().status).toBe('signed_out');
        expect(t.lastContext()).toBeNull();
    });

    it('is a no-op when signed out', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const before = session.getState();
        await session.logout();
        expect(t.authApi.calls).toEqual([]);
        expect(session.getState()).toBe(before);
    });
});

describe('SessionService.deregister', () => {
    it('on success removes account, secrets and context and calls onAccountRemoved', async () => {
        const { t, session, state } = await loggedIn();
        await session.deregister();
        expect(await t.registry.listAccounts()).toEqual([]);
        expect(await t.secrets.get(SecretKeys.token(state.account.id))).toBeNull();
        expect(t.lastContext()).toBeNull();
        expect(t.onAccountRemoved).toHaveBeenCalledWith(state.account.id);
        expect(session.getState()).toEqual({ status: 'signed_out', selectedServer: state.server });
    });

    it('leaves everything unchanged and rethrows when the remote call fails', async () => {
        const { t, session, state } = await loggedIn();
        const failure = new ApiError(456, 'Invalid token');
        t.authApi.failures.deregister = failure;
        await expect(session.deregister()).rejects.toBe(failure);
        expect(session.getState()).toBe(state);
        expect(await t.registry.listAccounts()).toHaveLength(1);
        expect(await t.secrets.get(SecretKeys.token(state.account.id))).toBe('tok-1');
        expect(t.lastContext()).not.toBeNull();
        expect(t.onAccountRemoved).not.toHaveBeenCalled();
    });

    it('throws NotSignedInError when signed out', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        await expect(session.deregister()).rejects.toBeInstanceOf(NotSignedInError);
    });
});

describe('SessionService.discardAccount', () => {
    it('throws for the active account and for an unknown id', async () => {
        const { session, state } = await loggedIn();
        await expect(session.discardAccount(state.account.id)).rejects.toThrow('Log out');
        await expect(session.discardAccount('nope')).rejects.toThrow('Unknown account');
    });

    it('works for an inactive account: secrets and entry removed, onAccountRemoved called', async () => {
        const { t, session, state } = await loggedIn();
        const other = await t.registry.createAccount({ serverId: state.server.id, userid: 'Other' });
        await t.secrets.set(SecretKeys.token(other.id), 'tok-other');
        await session.discardAccount(other.id);
        expect(await t.registry.findAccount(state.server.id, 'Other')).toBeNull();
        expect(await t.secrets.get(SecretKeys.token(other.id))).toBeNull();
        expect(t.onAccountRemoved).toHaveBeenCalledWith(other.id);
    });
});

describe('SessionService admin key', () => {
    it('unlockAdmin stores the key, updates the context and the state; init restores it', async () => {
        const { t, session, state } = await loggedIn();
        await session.unlockAdmin('adm');
        expect(await t.secrets.get(SecretKeys.adminKey(state.account.id))).toBe('adm');
        expect(t.lastContext()).toMatchObject({ token: 'tok-1', adminKey: 'adm' });
        expect(signedIn(session.getState()).adminUnlocked).toBe(true);
        const second = t.make();
        await second.init();
        expect(signedIn(second.getState()).adminUnlocked).toBe(true);
        expect(t.lastContext()).toMatchObject({ adminKey: 'adm' });
    });

    it('lockAdmin reverses it', async () => {
        const { t, session, state } = await loggedIn();
        await session.unlockAdmin('adm');
        await session.lockAdmin();
        expect(await t.secrets.get(SecretKeys.adminKey(state.account.id))).toBeNull();
        expect(t.lastContext()).not.toHaveProperty('adminKey');
        expect(signedIn(session.getState()).adminUnlocked).toBe(false);
    });

    it('is deleted by logout', async () => {
        const { t, session, state } = await loggedIn();
        await session.unlockAdmin('adm');
        await session.logout();
        expect(await t.secrets.get(SecretKeys.adminKey(state.account.id))).toBeNull();
    });

    it('throws NotSignedInError when signed out', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        await expect(session.unlockAdmin('adm')).rejects.toBeInstanceOf(NotSignedInError);
        await expect(session.lockAdmin()).rejects.toBeInstanceOf(NotSignedInError);
    });
});

describe('SessionService queue', () => {
    it('serializes parallel logins and ends with exactly one active account', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        const [first, second] = await Promise.allSettled([session.login('Alice', 'pw'), session.login('Bob', 'pw')]);
        expect(first.status).toBe('fulfilled');
        expect(second.status).toBe('rejected');
        expect(t.authApi.callsOf('login')).toHaveLength(1);
        expect(await t.registry.listAccounts()).toHaveLength(1);
        expect(signedIn(session.getState()).account.userid).toBe('Alice');
    });

    it('does not block the next operation after a rejected one', async () => {
        const t = setup();
        const session = t.make();
        await session.init();
        t.authApi.failures.login = new ApiError(455, 'Wrong password');
        const [bad, good] = await Promise.allSettled([session.login('Alice', 'bad'), session.login('Alice', 'good')]);
        expect(bad.status).toBe('rejected');
        expect(good.status).toBe('fulfilled');
        expect(session.getState().status).toBe('signed_in');
    });
});

describe('SessionService state', () => {
    it('keeps the getState() reference stable between changes', async () => {
        const t = setup();
        const session = t.make();
        expect(session.getState()).toBe(session.getState());
        await session.init();
        const afterInit = session.getState();
        expect(session.getState()).toBe(afterInit);
        await session.login('Alice', 'pw');
        expect(session.getState()).not.toBe(afterInit);
        expect(session.getState()).toBe(session.getState());
    });

    it('notifies listeners once per change and stops after unsubscribe', async () => {
        const t = setup();
        const session = t.make();
        const listener = jest.fn();
        const unsubscribe = session.subscribe(listener);
        await session.init();
        expect(listener).toHaveBeenCalledTimes(1);
        await session.login('Alice', 'pw');
        expect(listener).toHaveBeenCalledTimes(2);
        await session.unlockAdmin('adm');
        expect(listener).toHaveBeenCalledTimes(3);
        unsubscribe();
        await session.logout();
        expect(listener).toHaveBeenCalledTimes(3);
    });
});
