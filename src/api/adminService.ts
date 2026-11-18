import { request } from './apiClient';

// An invalid admin key answers with ApiError code 459. The API layer holds no state, so the
// caller (session layer / UI) reacts to it with `session.lockAdmin()`.

export async function resetUser(userhash: string): Promise<void> {
    await request('resetuser', { userhash }, { includeAdminKey: true });
}

export async function deleteUser(userhash: string): Promise<void> {
    await request('deleteuser', { userhash }, { includeAdminKey: true });
}

export async function clearAllData(): Promise<void> {
    await request('clear', {}, { includeToken: false, includeAdminKey: true });
}
