import { request } from './apiClient';
import { Invite } from './types';

export async function invite(chatid: number, invitedhash: string, useAdminKey = true): Promise<void> {
    await request('invite', { chatid, invitedhash }, { includeAdminKey: useAdminKey });
}

export async function getInvites(): Promise<Invite[]> {
    const res = await request<{ status: 'ok'; code: number; message: string; invites: Invite[]; }>(
        'getinvites', {},
    );
    return res.invites;
}

export async function rejectInvite(chatid: number): Promise<void> {
    await request('rejectinvite', { chatid });
}
