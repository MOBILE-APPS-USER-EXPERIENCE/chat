import type { StorageEnvironment } from './storageEnvironment';

export function createStorageEnvironment(): StorageEnvironment {
    return { kind: 'native' };
}
