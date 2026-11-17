import { MemoryAccountStorageFactory, MemoryRegistryRepository } from '../memory';
import { chatRepositoryContract } from './contracts/chats.contract';
import { messageRepositoryContract } from './contracts/messages.contract';
import { profileRepositoryContract } from './contracts/profiles.contract';
import { registryRepositoryContract } from './contracts/registry.contract';

chatRepositoryContract('memory', async () => new MemoryAccountStorageFactory().open('test'));
messageRepositoryContract('memory', async () => new MemoryAccountStorageFactory().open('test'));
profileRepositoryContract('memory', async () => new MemoryAccountStorageFactory().open('test'));
registryRepositoryContract('memory', async () => {
    let nextId = 0;
    return new MemoryRegistryRepository({ now: () => 123, newId: () => `id-${++nextId}` });
});
