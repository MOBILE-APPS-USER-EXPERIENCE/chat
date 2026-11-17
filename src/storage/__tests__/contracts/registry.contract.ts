import type { RegistryRepository } from '../../ports';
import { AccountExistsError, ServerExistsError } from '../../ports';

type AccountInput = Parameters<RegistryRepository['createAccount']>[0];
type AccountPatch = Parameters<RegistryRepository['updateAccount']>[1];

const URL = 'https://chat.example';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('Expected the promise to reject');
}

function expectPlainError(error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor).toBe(Error);
    expect(error).not.toBeInstanceOf(ServerExistsError);
    expect(error).not.toBeInstanceOf(AccountExistsError);
}

export function registryRepositoryContract(name: string, make: () => Promise<RegistryRepository> | RegistryRepository) {
    describe(`RegistryRepository (${name})`, () => {
        let registry: RegistryRepository;
        beforeEach(async () => {
            registry = await make();
        });

        it('normalizes server URLs and rejects duplicate normalized URLs', async () => {
            const server = await registry.addServer('Main', ` ${URL}/ `);
            expect(server.url).toBe(URL);
            await expect(registry.addServer('Again', `${URL}///`)).rejects.toBeInstanceOf(ServerExistsError);
        });

        it('trims the server name and rejects an empty name or URL with a plain Error', async () => {
            const server = await registry.addServer('  Main  ', URL);
            expect(server.name).toBe('Main');
            const invalid: [string, string][] = [
                ['   ', 'https://a.example'],
                ['', 'https://a.example'],
                ['A', ''],
                ['A', '   '],
                ['A', '///'],
            ];
            for (const [serverName, url] of invalid) {
                expectPlainError(await rejection(registry.addServer(serverName, url)));
            }
            expect(await registry.listServers()).toEqual([server]);
        });

        it('creates and finds accounts case-insensitively with injected time and ids', async () => {
            const server = await registry.addServer('Main', URL);
            const account = await registry.createAccount({ serverId: server.id, userid: 'Alice', nickname: 'A' });
            expect(account).toMatchObject({ serverId: server.id, userid: 'Alice', nickname: 'A', status: 'active', createdAt: 123 });
            expect(account.id).not.toBe(server.id);
            await expect(registry.createAccount({ serverId: server.id, userid: 'alice' })).rejects.toBeInstanceOf(AccountExistsError);
            expect(await registry.findAccount(server.id, 'ALICE')).toEqual(account);
        });

        it('allows the same userid on different servers', async () => {
            const first = await registry.addServer('One', 'https://one.example');
            const second = await registry.addServer('Two', 'https://two.example');
            await registry.createAccount({ serverId: first.id, userid: 'Alice' });
            await expect(registry.createAccount({ serverId: second.id, userid: 'Alice' })).resolves.toMatchObject({ serverId: second.id });
        });

        it('createAccount throws a plain Error for an unknown serverId and creates nothing', async () => {
            expectPlainError(await rejection(registry.createAccount({ serverId: 'missing', userid: 'Alice' })));
            expect(await registry.listAccounts()).toEqual([]);
        });

        it('createAccount builds the entry from known fields only', async () => {
            const server = await registry.addServer('Main', URL);
            const input = {
                serverId: server.id, userid: 'Alice', userHash: 'h', nickname: 'A', lastLoginAt: 5,
                extra: 'x', id: 'evil', status: 'server_deleted', createdAt: 1,
            } as unknown as AccountInput;
            const account = await registry.createAccount(input);
            expect(account).toMatchObject({ userHash: 'h', nickname: 'A', lastLoginAt: 5, status: 'active', createdAt: 123 });
            expect(account.id).not.toBe('evil');
            expect(account).not.toHaveProperty('extra');
            expect(await registry.findAccount(server.id, 'Alice')).not.toHaveProperty('extra');
        });

        it('updates only mutable fields', async () => {
            const server = await registry.addServer('Main', URL);
            const account = await registry.createAccount({ serverId: server.id, userid: 'Alice' });
            await registry.updateAccount(account.id, { nickname: 'Updated', status: 'server_deleted', lastLoginAt: 9, userHash: 'h' });
            expect(await registry.findAccount(server.id, 'alice')).toMatchObject({
                nickname: 'Updated', status: 'server_deleted', lastLoginAt: 9, userHash: 'h',
            });
        });

        it('updateAccount ignores id, serverId and userid keys in the patch', async () => {
            const server = await registry.addServer('Main', URL);
            const other = await registry.addServer('Other', 'https://other.example');
            const account = await registry.createAccount({ serverId: server.id, userid: 'Alice' });
            const patch = { id: 'hijacked', serverId: other.id, userid: 'mallory', nickname: 'New' } as unknown as AccountPatch;
            await registry.updateAccount(account.id, patch);
            expect(await registry.listAccounts()).toEqual([expect.objectContaining({
                id: account.id, serverId: server.id, userid: 'Alice', nickname: 'New',
            })]);
            expect(await registry.findAccount(other.id, 'mallory')).toBeNull();
        });

        it('updateAccount ignores keys whose value is undefined', async () => {
            const server = await registry.addServer('Main', URL);
            const account = await registry.createAccount({ serverId: server.id, userid: 'Alice', nickname: 'A', userHash: 'h' });
            const patch = { nickname: undefined, userHash: undefined, status: 'server_deleted' } as unknown as AccountPatch;
            await registry.updateAccount(account.id, patch);
            expect(await registry.findAccount(server.id, 'Alice')).toMatchObject({
                nickname: 'A', userHash: 'h', status: 'server_deleted',
            });
        });

        it('updateAccount throws for an unknown account id', async () => {
            await expect(registry.updateAccount('missing', { nickname: 'x' })).rejects.toThrow();
            expect(await registry.listAccounts()).toEqual([]);
        });

        it('round-trips the active account and clears it on removal', async () => {
            const server = await registry.addServer('Main', URL);
            const account = await registry.createAccount({ serverId: server.id, userid: 'Alice' });
            await registry.setActiveAccountId(account.id);
            expect(await registry.getActiveAccountId()).toBe(account.id);
            await registry.setActiveAccountId(null);
            expect(await registry.getActiveAccountId()).toBeNull();
            await registry.setActiveAccountId(account.id);
            await registry.removeAccount(account.id);
            expect(await registry.getActiveAccountId()).toBeNull();
            await expect(registry.setActiveAccountId('missing')).rejects.toThrow();
        });

        it('lists servers and accounts in insertion order', async () => {
            const names = ['c', 'a', 'b'];
            const servers = [];
            for (const serverName of names) servers.push(await registry.addServer(serverName, `https://${serverName}.example`));
            const userids = ['zed', 'amy', 'bob'];
            for (const userid of userids) await registry.createAccount({ serverId: servers[0].id, userid });
            expect((await registry.listServers()).map(server => server.name)).toEqual(names);
            expect((await registry.listAccounts()).map(account => account.userid)).toEqual(userids);
        });

        it('returns copies: mutating results does not change later reads', async () => {
            const server = await registry.addServer('Main', URL);
            const serverId = server.id;
            const input = { serverId, userid: 'Alice', nickname: 'A' };
            const account = await registry.createAccount(input);
            const accountId = account.id;
            input.nickname = 'mutated input';
            server.name = 'mutated'; server.url = 'mutated';
            account.nickname = 'mutated'; account.status = 'server_deleted';

            const [listedServer] = await registry.listServers();
            const [listedAccount] = await registry.listAccounts();
            const found = await registry.findAccount(serverId, 'Alice');
            if (!listedServer || !listedAccount || !found) throw new Error('expected stored registry data');
            listedServer.name = 'mutated list';
            listedAccount.nickname = 'mutated list';
            found.nickname = 'mutated find';

            expect(await registry.listServers()).toEqual([{ id: serverId, name: 'Main', url: URL }]);
            expect(await registry.listAccounts()).toEqual([expect.objectContaining({ id: accountId, nickname: 'A', status: 'active' })]);
            expect(await registry.findAccount(serverId, 'Alice')).toMatchObject({ nickname: 'A' });
        });
    });
}
