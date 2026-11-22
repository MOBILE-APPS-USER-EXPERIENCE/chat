import { ApiContext, request } from './apiClient';

export type AuthResult = { token: string; hash: string; message: string; };
type AuthResponse = AuthResult & { code: number; status: 'ok'; };

export async function register(
    ctx: ApiContext, userid: string, password: string, nickname: string, fullname: string,
): Promise<AuthResult> {
    return request<AuthResponse>(
        'register', { userid, password, nickname, fullname }, { includeToken: false, context: ctx },
    );
}

export async function login(ctx: ApiContext, userid: string, password: string): Promise<AuthResult> {
    return request<AuthResponse>('login', { userid, password }, { includeToken: false, context: ctx });
}

export async function logout(ctx: ApiContext, options: { timeoutMs?: number } = {}): Promise<void> {
    await request('logout', {}, { context: ctx, timeoutMs: options.timeoutMs });
}

export async function deregister(ctx: ApiContext): Promise<void> {
    await request('deregister', {}, { context: ctx });
}

export async function validateToken(ctx: ApiContext): Promise<boolean> {
    const res = await request<{ status: 'ok'; code: number; message: string; }>(
        'validatetoken', {}, { context: ctx },
    );
    return res.message === 'Token valid';
}
