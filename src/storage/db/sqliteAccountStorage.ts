import { deleteAccountDatabase, openAccountDatabase } from './openDatabase';
import { SqliteChatRepository } from './sqliteChatRepository';
import { SqliteMessageRepository } from './sqliteMessageRepository';
import { SqliteProfileRepository } from './sqliteProfileRepository';
import type { SqliteDb } from './types';
import type { AccountStorage, AccountStorageFactory } from '../ports';

/**
 * Composes the SQLite repositories over one connection. `close` releases the shared handle
 * returned by `openAccountDatabase`, so concurrent users of the same account share the open.
 */
export function createSqliteAccountStorage(db: SqliteDb, close: () => Promise<void>): AccountStorage {
    return {
        chats: new SqliteChatRepository(db),
        profiles: new SqliteProfileRepository(db),
        messages: new SqliteMessageRepository(db),
        close,
    };
}

/**
 * Factory on top of `openAccountDatabase`/`deleteAccountDatabase`. This is the only module in
 * the SQLite backend that may import `openDatabase`.
 */
export class SqliteAccountStorageFactory implements AccountStorageFactory {
    async open(accountId: string): Promise<AccountStorage> {
        const { db, close } = await openAccountDatabase(accountId);
        return createSqliteAccountStorage(db, close);
    }

    async destroy(accountId: string): Promise<void> {
        await deleteAccountDatabase(accountId);
    }
}

/** Entry point for the lazy dynamic import in `accountStorage.ts`. */
export function createSqliteFactory(): AccountStorageFactory {
    return new SqliteAccountStorageFactory();
}
