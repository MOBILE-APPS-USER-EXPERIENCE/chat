import type { SecretStore } from '../ports';
import { NativeSecretStore } from './nativeSecretStore';

export function createPlatformSecretStore(): SecretStore {
    return new NativeSecretStore();
}
