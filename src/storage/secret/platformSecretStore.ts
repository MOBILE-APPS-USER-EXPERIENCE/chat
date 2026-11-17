import type { SecretStore } from '../ports';
import { WebSecretStore } from './webSecretStore';

export function createPlatformSecretStore(): SecretStore {
    return new WebSecretStore();
}
