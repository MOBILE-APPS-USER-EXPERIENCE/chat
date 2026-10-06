import { getBaseUrl, setBaseUrl } from './apiClient';

export async function getCurrentServer(): Promise<string> {
    return getBaseUrl();
}

export async function changeServer(url: string): Promise<void> {
    await setBaseUrl(url);
}

export async function resetServerToDefault(): Promise<void> {
    await setBaseUrl(undefined);
}
