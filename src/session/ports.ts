import type { ApiContext } from '../api/apiClient';
import type { AccountEntry, ServerEntry } from '../storage/types';

export interface AuthApi {          // satisfied by an adapter over src/api/authService
    login(ctx: ApiContext, userid: string, password: string): Promise<{ token: string; hash: string }>;
    register(ctx: ApiContext, userid: string, password: string, nickname: string, fullname: string): Promise<{ token: string; hash: string }>;
    logout(ctx: ApiContext, options?: { timeoutMs?: number }): Promise<void>;
    deregister(ctx: ApiContext): Promise<void>;
}

export type SessionState =
    | { status: 'initializing' }
    | { status: 'signed_out'; selectedServer: ServerEntry | null }
    | { status: 'signed_in'; account: AccountEntry; server: ServerEntry; adminUnlocked: boolean };

export class NoServerSelectedError extends Error {
    constructor(message = 'No server selected') {
        super(message);
        this.name = 'NoServerSelectedError';
    }
}

export class NotSignedInError extends Error {
    constructor(message = 'Not signed in') {
        super(message);
        this.name = 'NotSignedInError';
    }
}

/** The local account for this server/userid belongs to a different (deleted) server user. */
export class StaleAccountError extends Error {
    constructor(readonly accountId: string, message?: string) {
        super(message);
        this.name = 'StaleAccountError';
    }
}
