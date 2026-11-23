import AsyncStorage from '@react-native-async-storage/async-storage';

import { setActiveContext } from '../api/apiClient';
import * as authService from '../api/authService';
import { keyValueStore, registry, secretStore } from '../storage';
import { accountStorage } from '../storage/accountStorage';
import type { AuthApi } from './ports';
import { headersForServer } from './serverHeaders';
import { SessionService } from './sessionService';

const LEGACY_KEYS = ['chat.token', 'chat.adminKey', 'chat.baseUrl'];

const authApi: AuthApi = {
    login: async (ctx, userid, password) => {
        const { token, hash } = await authService.login(ctx, userid, password);
        return { token, hash };
    },
    register: async (ctx, userid, password, nickname, fullname) => {
        const { token, hash } = await authService.register(ctx, userid, password, nickname, fullname);
        return { token, hash };
    },
    logout: (ctx, options) => authService.logout(ctx, options),
    deregister: (ctx) => authService.deregister(ctx),
};

// Constructing the service touches no storage; init() is started from an effect.
export const session = new SessionService({
    registry,
    secrets: secretStore,
    kv: keyValueStore,
    authApi,
    setActiveContext,
    headersForServer,
    now: Date.now,
    // Users have to log in again after the update; old plain-text values are removed.
    legacyCleanup: () => AsyncStorage.multiRemove(LEGACY_KEYS),
    // Removing an account also deletes its local database (best effort, see ADR-005).
    onAccountRemoved: (accountId) => accountStorage.destroy(accountId),
});
