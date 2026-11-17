import { AccountExistsError, ServerExistsError } from '../../ports';
import type { RegistryRepository } from '../../ports';

export function registryRepositoryContract(name: string, make: () => RegistryRepository) {
    describe(`RegistryRepository (${name})`, () => {
        let registry: RegistryRepository;
        beforeEach(() => {
            registry = make();
        });

        it('normalizes server URLs and rejects duplicate normalized URLs', async () => {
            const server = await registry.addServer('Main', ' https://chat.example/ ');
            expect(server.url).toBe('https://chat.example');
            await expect(registry.addServer('Again', 'https://chat.example///')).rejects.toBeInstanceOf(ServerExistsError);
        });

        it('creates and finds accounts case-insensitively with injected time and ids', async () => {
            const account = await registry.createAccount({ serverId: 's1', userid: 'Alice', nickname: 'A' });
            expect(account).toMatchObject({ id: 'id-1', status: 'active', createdAt: 123 });
            await expect(registry.createAccount({ serverId: 's1', userid: 'alice' })).rejects.toBeInstanceOf(AccountExistsError);
            expect(await registry.findAccount('s1', 'ALICE')).toMatchObject({ id: 'id-1' });
        });

        it('updates only mutable fields and rejects unknown accounts', async () => {
            const account = await registry.createAccount({ serverId: 's1', userid: 'Alice' });
            await registry.updateAccount(account.id, { nickname: 'Updated', status: 'server_deleted' });
            expect(await registry.findAccount('s1', 'alice')).toMatchObject({ nickname: 'Updated', status: 'server_deleted' });
            await expect(registry.updateAccount('missing', { nickname: 'x' })).rejects.toThrow();
        });

        it('round-trips the active account and clears it on removal', async () => {
            const account = await registry.createAccount({ serverId: 's1', userid: 'Alice' });
            await registry.setActiveAccountId(account.id);
            expect(await registry.getActiveAccountId()).toBe(account.id);
            await registry.removeAccount(account.id);
            expect(await registry.getActiveAccountId()).toBeNull();
            await expect(registry.setActiveAccountId('missing')).rejects.toThrow();
        });
    });
}
