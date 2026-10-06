import { ApiError, request, setAdminKey } from './apiClient';

async function withAdminFallback<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof ApiError && e.code === 459) await setAdminKey(undefined);
        throw e;
    }
}

export async function resetUser(userhash: string): Promise<void> {
    await withAdminFallback(() => request('resetuser', { userhash }, { includeAdminKey: true }));
}

export async function deleteUser(userhash: string): Promise<void> {
    await withAdminFallback(() => request('deleteuser', { userhash }, { includeAdminKey: true }));
}

export async function clearAllData(): Promise<void> {
    await withAdminFallback(() =>
        request('clear', {}, { includeToken: false, includeAdminKey: true }),
    );
}
