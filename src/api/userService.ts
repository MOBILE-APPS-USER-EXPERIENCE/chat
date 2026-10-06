import { request } from './apiClient';
import { User } from './types';

export async function getProfiles(useAdminKey = true): Promise<User[]> {
    const res = await request<{ status: 'ok'; code: number; message: string; profiles: User[]; }>(
        'getprofiles', {}, { includeAdminKey: useAdminKey },
    );
    return res.profiles;
}
