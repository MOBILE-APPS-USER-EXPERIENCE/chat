import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomValues, randomUUID } from "expo-crypto";

import { JsonKeyValueStore } from "./kv/jsonKeyValueStore";
import type { KeyValueStore, RegistryRepository, SecretStore } from "./ports";
import { KvRegistryRepository } from "./registry/kvRegistryRepository";
import { createPlatformSecretStore } from "./secret/platformSecretStore";

export * from "./ports";

/** RFC 4122 v4 UUID from getRandomValues, which (unlike randomUUID) also works in non-secure web contexts. */
function uuidFromRandomValues(): string {
  const bytes = getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Shared id generator, also reused outside this module (e.g. `messaging/runtime/index.ts`). */
export function newId(): string {
  try {
    return randomUUID();
  } catch {
    // crypto.randomUUID is secure-context only (plain http on a LAN IP); fall back.
    return uuidFromRandomValues();
  }
}

// Nothing here touches storage at import time: the constructors only keep references.
export const secretStore: SecretStore = createPlatformSecretStore();
export const keyValueStore: KeyValueStore = new JsonKeyValueStore(AsyncStorage);
export const registry: RegistryRepository = new KvRegistryRepository(
  keyValueStore,
  {
    now: () => Date.now(),
    newId,
  },
);
