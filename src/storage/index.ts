import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { JsonKeyValueStore } from './kv/jsonKeyValueStore';
import type { KeyValueStore, RegistryRepository, SecretStore } from './ports';
import { KvRegistryRepository } from './registry/kvRegistryRepository';
import { createPlatformSecretStore } from './secret/platformSecretStore';

export * from './ports';

// Nothing here touches storage at import time: the constructors only keep references.
export const secretStore: SecretStore = createPlatformSecretStore();
export const keyValueStore: KeyValueStore = new JsonKeyValueStore(AsyncStorage);
export const registry: RegistryRepository = new KvRegistryRepository(keyValueStore, {
    now: () => Date.now(),
    newId: () => randomUUID(),
});
