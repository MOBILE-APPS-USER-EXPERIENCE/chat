import { request } from './apiClient';

export async function ping(): Promise<string> {
    const res = await request<{ status: 'ok'; code: number; message: string; }>(
        'ping', {}, { includeToken: false },
    );
    return res.message ?? 'Pong';
}
