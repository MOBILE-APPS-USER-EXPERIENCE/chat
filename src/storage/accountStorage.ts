import { AccountStorageManager, type StorageStatus } from './accountStorageManager';
import { MemoryAccountStorageFactory } from './memory';
import type { AccountStorageFactory } from './ports';
import { keyValueStore } from './index';
import { createStorageEnvironment } from './storageEnvironment';

/**
 * Composition root for the account storage. The SQLite backend is loaded lazily via a dynamic
 * import so that neither `expo-sqlite` nor the migration bundle is evaluated at startup — a
 * hard requirement for the statically exported web build.
 */

const manager = new AccountStorageManager({
    environment: createStorageEnvironment,
    loadSqlite: async () => (await import('./db/sqliteAccountStorage')).createSqliteFactory(),
    memory: new MemoryAccountStorageFactory(),
    kv: keyValueStore,
});

export const accountStorage: AccountStorageFactory = manager;
export const getStorageStatus = (): StorageStatus => manager.getStatus();
export const retryPendingDeletions = (): Promise<void> => manager.retryPendingDeletions();
export type { StorageStatus };
