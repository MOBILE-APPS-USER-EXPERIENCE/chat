import { ApiContext, ApiError, NetworkError, request } from './apiClient';

/** True only for code 200 and message 'Pong'. Server and network failures give false. */
export async function ping(context: ApiContext, timeoutMs?: number): Promise<boolean> {
    try {
        const res = await request<{ status: 'ok'; code: number; message: string; }>(
            'ping', {}, { includeToken: false, context, timeoutMs },
        );
        return res.code === 200 && res.message === 'Pong';
    } catch (error) {
        if (error instanceof ApiError || error instanceof NetworkError) return false;
        throw error;
    }
}
