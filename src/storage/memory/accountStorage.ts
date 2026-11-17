import type { AccountStorage, AccountStorageFactory } from '../ports';
import { MemoryChatRepository } from './chatRepository';
import { MemoryMessageRepository } from './messageRepository';
import { MemoryProfileRepository } from './profileRepository';
import { MemoryDb } from './memoryStorage';

function createStorage(db: MemoryDb): AccountStorage {
    return {
        chats: new MemoryChatRepository(db),
        profiles: new MemoryProfileRepository(db),
        messages: new MemoryMessageRepository(db),
        close: async () => { },
    };
}

export function createMemoryAccountStorage(): AccountStorage {
    return createStorage(new MemoryDb());
}

export class MemoryAccountStorageFactory implements AccountStorageFactory {
    private readonly databases = new Map<string, MemoryDb>();

    async open(accountId: string) {
        const db = this.databases.get(accountId) ?? new MemoryDb();
        this.databases.set(accountId, db);
        return createStorage(db);
    }

    async destroy(accountId: string) {
        this.databases.delete(accountId);
    }
}
