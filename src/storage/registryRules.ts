import type { AccountEntry, ServerEntry } from './types';

export type NewAccountInput = Omit<AccountEntry, 'id' | 'createdAt' | 'status'>;
export type AccountPatch = Partial<Omit<AccountEntry, 'id' | 'serverId' | 'userid'>>;

/** Fields that `updateAccount` may change. `id`, `serverId`, `userid` and unknown keys are ignored. */
const MUTABLE_ACCOUNT_KEYS = ['userHash', 'nickname', 'status', 'createdAt', 'lastLoginAt'] as const;

/** Trims the URL and removes trailing slashes. */
export function normalizeServerUrl(url: string): string {
    const trimmed = url.trim();
    let end = trimmed.length;
    while (end > 0 && trimmed.charAt(end - 1) === '/') end--;
    return trimmed.slice(0, end);
}

/** Userids are compared case-insensitively. */
export function sameUserid(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

/** Copies a server, keeping only known fields. */
export function copyServer(server: ServerEntry): ServerEntry {
    return { id: server.id, name: server.name, url: server.url };
}

/** Copies an account, keeping only known fields and omitting undefined optionals. */
export function copyAccount(account: AccountEntry): AccountEntry {
    const copy: AccountEntry = {
        id: account.id,
        serverId: account.serverId,
        userid: account.userid,
        status: account.status,
        createdAt: account.createdAt,
    };
    if (account.userHash !== undefined) copy.userHash = account.userHash;
    if (account.nickname !== undefined) copy.nickname = account.nickname;
    if (account.lastLoginAt !== undefined) copy.lastLoginAt = account.lastLoginAt;
    return copy;
}

/** Builds a new active account from known input fields only (no arbitrary extra keys). */
export function buildAccount(input: NewAccountInput, id: string, createdAt: number): AccountEntry {
    return copyAccount({
        id,
        serverId: input.serverId,
        userid: input.userid,
        userHash: input.userHash,
        nickname: input.nickname,
        lastLoginAt: input.lastLoginAt,
        status: 'active',
        createdAt,
    });
}

/** Applies a patch in place. Immutable keys and `undefined` values are ignored at runtime. */
export function applyAccountPatch(account: AccountEntry, patch: AccountPatch): void {
    for (const key of MUTABLE_ACCOUNT_KEYS) {
        const value = patch[key];
        if (value !== undefined) Object.assign(account, { [key]: value });
    }
}
