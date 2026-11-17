import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_BASE_URL = 'https://www2.hs-esslingen.de/~chkohl/chat';
const BACKUP_BASE_URL = 'https://api.chat.throin.de';

const BASE_URL_KEY = 'chat.baseUrl';
const TOKEN_KEY = 'chat.token';
const ADMIN_KEY_KEY = 'chat.adminKey';
const X_ACCESS_TOKEN = process.env.EXPO_PUBLIC_X_ACCESS_TOKEN ?? '';
const DEFAULT_BASE_URL_PING_TIMEOUT_MS = 3000;

export class ApiError extends Error {
    constructor(public code: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

let baseUrl: string = DEFAULT_BASE_URL;
let token: string | undefined;
let adminKey: string | undefined;
let initPromise: Promise<void> | undefined;

function normalizeBaseUrl(url: string): string {
    let normalized = url.trim();
    while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
}

async function getDefaultBaseUrl(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_BASE_URL_PING_TIMEOUT_MS);

    try {
        const res = await fetch(`${DEFAULT_BASE_URL}/?request=ping`, {
            headers: { 'X-Access-Token': X_ACCESS_TOKEN },
            signal: controller.signal,
        });
        const json = await res.json();
        return json.code === 200 && json.message === 'Pong'
            ? DEFAULT_BASE_URL
            : BACKUP_BASE_URL;
    } catch (error) {
        console.error('Default base URL unreachable:', error);
        return BACKUP_BASE_URL;
    } finally {
        clearTimeout(timeout);
    }
}

export function initApiClient(): Promise<void> {
    initPromise ??= (async () => {
        const [storedBaseUrl, storedToken, storedAdminKey] = await Promise.all([
            AsyncStorage.getItem(BASE_URL_KEY),
            AsyncStorage.getItem(TOKEN_KEY),
            AsyncStorage.getItem(ADMIN_KEY_KEY),
        ]);
        baseUrl = storedBaseUrl && storedBaseUrl !== DEFAULT_BASE_URL
            ? normalizeBaseUrl(storedBaseUrl)
            : await getDefaultBaseUrl();
        token = storedToken ?? undefined;
        adminKey = storedAdminKey ?? undefined;
    })();
    return initPromise;
}

export async function getBaseUrl(): Promise<string> {
    await initApiClient();
    return baseUrl;
}

export async function setBaseUrl(url: string | undefined): Promise<void> {
    baseUrl = url ? normalizeBaseUrl(url) : DEFAULT_BASE_URL;
    if (url) await AsyncStorage.setItem(BASE_URL_KEY, baseUrl);
    else await AsyncStorage.removeItem(BASE_URL_KEY);
}

export async function setToken(value: string | undefined) {
    token = value;
    if (value) await AsyncStorage.setItem(TOKEN_KEY, value);
    else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function setAdminKey(value: string | undefined) {
    adminKey = value;
    if (value) await AsyncStorage.setItem(ADMIN_KEY_KEY, value);
    else await AsyncStorage.removeItem(ADMIN_KEY_KEY);
}

export function getToken() { return token; }
export function getAdminKey() { return adminKey; }

type StatusResponse = { status: 'ok' | 'error'; message?: string; code: number; };

export async function request<T extends StatusResponse>(
    command: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: { includeToken?: boolean; includeAdminKey?: boolean; } = {},
): Promise<T> {

    const { includeToken = true, includeAdminKey = false } = options;
    const query = new URLSearchParams({ request: command });

    if (includeToken && token) query.append('token', token);
    if (includeAdminKey && adminKey) query.append('key', adminKey);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.append(key, String(value));
    }

    const response = await fetch(`${baseUrl}/?${query.toString()}`, {
        headers: { ...getHeaders() },
    });
    const json = (await response.json()) as T;

    if (json.status === 'error') {
        throw new ApiError(json.code, json.message ?? 'Unknown error');
    }
    return json;
}

export async function postRequest<T extends StatusResponse>(
    command: string,
    body: Record<string, unknown>,
): Promise<T> {

    const payload = { request: command, token, ...body };
    const response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getHeaders(),
        },
        body: JSON.stringify(payload),
    });

    const json = (await response.json()) as T;
    if (json.status === 'error') {
        throw new ApiError(json.code, json.message ?? 'Unknown error');
    }
    return json;
}

export type BinaryResult = {
    blob: Blob;
    contentType: string | null;
    contentDisposition: string | null;
};

export async function requestBinary(
    command: string,
    params: Record<string, string | number | boolean | undefined> = {},
): Promise<BinaryResult> {

    const query = new URLSearchParams({ request: command });
    if (token) query.append('token', token);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.append(key, String(value));
    }

    const response = await fetch(`${baseUrl}/?${query.toString()}`, {
        headers: { ...getHeaders() },
    });
    const contentType = response.headers.get('content-type');

    // If the response is JSON it gets parsed and an ApiError is thrown, otherwise the binary data is returned.
    if (contentType?.includes('application/json')) {
        const json = await response.json();
        throw new ApiError(json.code, json.message ?? 'Unknown error');
    }

    return {
        blob: await response.blob(),
        contentType,
        contentDisposition: response.headers.get('content-disposition'),
    };
}

function getHeaders(): Record<string, string> {
    if (X_ACCESS_TOKEN.length < 5) {
        console.warn('Are you sure you set the correct X_ACCESS_TOKEN in apiClient.ts?');
    }
    return baseUrl === DEFAULT_BASE_URL
        ? { 'X-Access-Token': X_ACCESS_TOKEN }
        : {};
}
