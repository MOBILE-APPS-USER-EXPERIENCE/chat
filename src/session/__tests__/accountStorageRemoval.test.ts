import type { ApiContext } from '../../api/apiClient';
import { JsonKeyValueStore } from '../../storage/kv/jsonKeyValueStore';
import { AccountStorageManager } from '../../storage/accountStorageManager';
import { MemoryAccountStorageFactory, MemoryRegistryRepository, MemorySecretStore, MemoryStringBackend } from '../../storage/memory';
import type { AccountStorage, AccountStorageFactory } from '../../storage/ports';
import type { AuthApi } from '../ports';
import { SessionService } from '../sessionService';

/**
 * Proves that a failing database deletion cannot break deregistration or registering over an
 * existing account: the manager records the id in `storage.pendingDeletions` instead of
 * throwing, so `purgeAccount` completes.
 */

class FakeAuthApi implements AuthApi {
    async login(ctx: ApiContext, userid: string) { return { token: 'tok-1', hash: 'hash-1' }; }
    async register(ctx: ApiContext, userid: string) { return { token: 'tok-1', hash: 'hash-1' }; }
    async logout(ctx: ApiContext, options?: { timeoutMs?: number }) { }
    async deregister(ctx: ApiContext) { }
}

/** SQLite stand-in whose destroy always fails, like a locked or missing database file. */
class FailingDestroyFactory implements AccountStorageFactory {
    readonly destroyed: string[] = [];
    async open(accountId: string): Promise<AccountStorage> { throw new Error('sqlite unavailable in this test'); }
    async destroy(accountId: string) {
        this.destroyed.push(accountId);
        throw new Error('delete failed');
    }
}

function setup() {
    let counter = 0;
    const registry = new MemoryRegistryRepository({ now: () => 1000, newId: () => `id-${++counter}` });
    const secrets = new MemorySecretStore();
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    const sqlite = new FailingDestroyFactory();
    const manager = new AccountStorageManager({
        environment: () => ({ kind: 'native' }),
        loadSqlite: async () => sqlite,
        memory: new MemoryAccountStorageFactory(),
        kv,
    });
    const session = new SessionService({
        registry, secrets, kv,
        authApi: new FakeAuthApi(),
        setActiveContext: () => undefined,
        headersForServer: (url) => ({ 'X-Test': url }),
        now: () => 5000,
        onAccountRemoved: (id) => manager.destroy(id),
    });
    return { registry, secrets, kv, sqlite, manager, session };
}

describe('session with a failing account database deletion', () => {
    it('completes deregistration and records the account for a later retry', async () => {
        const t = setup();
        await t.session.init();
        await t.session.login('Alice', 'pw');
        const before = t.session.getState();
        if (before.status !== 'signed_in') throw new Error('expected signed_in');

        await t.session.deregister();

        expect(t.sqlite.destroyed).toEqual([before.account.id]);
        expect(await t.kv.getJson('storage.pendingDeletions')).toEqual([before.account.id]);
        expect(t.session.getState().status).toBe('signed_out');
    });

    it('completes registering over an existing account despite the failing deletion', async () => {
        const t = setup();
        await t.session.init();
        await t.session.login('Alice', 'pw');
        const before = t.session.getState();
        if (before.status !== 'signed_in') throw new Error('expected signed_in');
        await t.session.logout();

        await t.session.register('Alice', 'pw', 'Nick', '');

        expect(t.sqlite.destroyed).toEqual([before.account.id]);
        expect(await t.kv.getJson('storage.pendingDeletions')).toEqual([before.account.id]);
        const after = t.session.getState();
        if (after.status !== 'signed_in') throw new Error('expected signed_in after register');
        expect(after.account.id).not.toBe(before.account.id);
    });
});
