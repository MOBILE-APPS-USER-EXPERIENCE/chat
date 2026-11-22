import { request } from './apiClient';
import { Chat } from './types';

export async function getChats(useAdminKey = true): Promise<Chat[]> {
    const res = await request<{ status: 'ok'; code: number; message: string; chats: Chat[]; }>(
        'getchats', {}, { includeAdminKey: useAdminKey },
    );
    return res.chats.map((chat) => ({ ...chat, chatid: normalizeChatId(chat.chatid) }));
}

function normalizeChatId(value: unknown): number {
    const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 0) throw new Error('Der Server hat keine gültige Chat-ID gesendet.');
    return id;
}

export async function createChat(params: {
    chatname: string;
    ispublic?: boolean;
    directchat?: boolean;
}): Promise<number> {
    const res = await request<{ status: 'ok'; code: number; message: string; chatid: number; }>(
        'createchat', params,
    );
    return normalizeChatId(res.chatid);
}

export async function deleteChat(chatid: number, useAdminKey = true): Promise<void> {
    await request('deletechat', { chatid }, { includeAdminKey: useAdminKey });
}

export async function joinChat(chatid: number): Promise<void> {
    await request('joinchat', { chatid });
}

export async function leaveChat(chatid: number): Promise<void> {
    await request('leavechat', { chatid });
}
