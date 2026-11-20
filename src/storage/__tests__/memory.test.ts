import type { AccountStorage } from '../ports';
import { MemoryAccountStorageFactory, MemoryRegistryRepository } from '../memory';
import { chatRepositoryContract } from './contracts/chats.contract';
import { messageRepositoryContract } from './contracts/messages.contract';
import { profileRepositoryContract } from './contracts/profiles.contract';
import { registryRepositoryContract } from './contracts/registry.contract';

// The contracts never close what `make` returns; the runner owns the cleanup.
const openStorages: AccountStorage[] = [];

afterEach(async () => {
    await Promise.all(openStorages.splice(0).map(storage => storage.close()));
});

const makeStorage = async (): Promise<AccountStorage> => {
    const storage = await new MemoryAccountStorageFactory().open('test');
    openStorages.push(storage);
    return storage;
};

chatRepositoryContract('memory', makeStorage);
messageRepositoryContract('memory', makeStorage);
profileRepositoryContract('memory', makeStorage);
registryRepositoryContract('memory', async () => {
    let nextId = 0;
    return new MemoryRegistryRepository({ now: () => 123, newId: () => `id-${++nextId}` });
});
