import { request, setAdminKey, setToken } from './apiClient';

export type AuthResult = { token: string; hash: string; message: string; };

export async function register(
    userid: string, password: string, nickname: string, fullname: string,
): Promise<AuthResult> {
    const res = await request<AuthResult & { code: number; status: 'ok'; }>(
        'register', { userid, password, nickname, fullname }, { includeToken: false },
    );
    await setToken(res.token);
    return res;
}

export async function login(userid: string, password: string): Promise<AuthResult> {
    const res = await request<AuthResult & { code: number; status: 'ok'; }>(
        'login', { userid, password }, { includeToken: false },
    );
    await setToken(res.token);
    return res;
}

export async function logout(): Promise<void> {
    await request('logout', {});
    await setToken(undefined);
    await setAdminKey(undefined);
}

export async function deregister(): Promise<void> {
    await request('deregister', {});
    await setToken(undefined);
    await setAdminKey(undefined);
}

export async function validateToken(): Promise<boolean> {
    const res = await request<{ status: 'ok'; code: number; message: string; }>('validatetoken', {});
    return res.message === 'Token valid';
}

export async function unlockAdmin(key: string): Promise<void> {
    await setAdminKey(key);
}
