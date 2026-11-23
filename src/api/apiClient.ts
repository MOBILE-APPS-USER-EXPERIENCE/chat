export class ApiError extends Error {
    constructor(public code: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export class NoApiContextError extends Error {
    constructor(message = 'No API context available') {
        super(message);
        this.name = 'NoApiContextError';
    }
}

/** fetch failed or timed out. The message is generic and never contains URL, token or key. */
export class NetworkError extends Error {
    constructor(message = 'Network request failed') {
        super(message);
        this.name = 'NetworkError';
    }
}

export type ApiContext = {
    baseUrl: string;
    token?: string;
    adminKey?: string;
    headers?: Record<string, string>;
};

export type RequestOptions = {
    includeToken?: boolean;               // default true
    includeAdminKey?: boolean;            // default false
    context?: ApiContext;                 // default: the active context
    timeoutMs?: number;                   // defaults by request kind
};

export type BinaryResult = {
    blob: Blob;
    contentType: string | null;
    contentDisposition: string | null;
};

type Params = Record<string, string | number | boolean | undefined>;
type StatusResponse = { status: 'ok' | 'error'; message?: string; code: number; };
type BodyOptions = Pick<RequestOptions, 'context' | 'timeoutMs'>;

const INVALID_RESPONSE = 'Invalid server response';
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_BINARY_TIMEOUT_MS = 60_000;

// Plain module state, no storage: the session layer decides what is active.
let activeContext: ApiContext | null = null;


function freezeContext(context: ApiContext): ApiContext {
    const copy: ApiContext = { baseUrl: context.baseUrl };
    if (context.token !== undefined) copy.token = context.token;
    if (context.adminKey !== undefined) copy.adminKey = context.adminKey;
    if (context.headers !== undefined) copy.headers = Object.freeze({ ...context.headers });
    return Object.freeze(copy);
}

export function setActiveContext(context: ApiContext | null): void {
    activeContext = context ? freezeContext(context) : null;
}

export function getActiveContext(): ApiContext | null {
    return activeContext;
}

function resolveContext(context: ApiContext | undefined): ApiContext {
    const resolved = context ?? activeContext;
    if (!resolved) throw new NoApiContextError();
    return resolved;
}

function trimTrailingSlashes(url: string): string {
    let end = url.length;
    while (end > 0 && url.charAt(end - 1) === '/') end--;
    return url.slice(0, end);
}

function buildGetUrl(
    ctx: ApiContext, command: string, params: Params, includeToken: boolean, includeAdminKey: boolean,
): string {
    const query = new URLSearchParams({ request: command });
    if (includeToken && ctx.token) query.append('token', ctx.token);
    if (includeAdminKey && ctx.adminKey) query.append('key', ctx.adminKey);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.append(key, String(value));
    }
    return `${trimTrailingSlashes(ctx.baseUrl)}/?${query.toString()}`;
}

/** fetch + body handling under one optional timeout. The timer is always cleared. */
async function execute<R>(
    url: string,
    init: RequestInit,
    timeoutMs: number | undefined,
    handle: (response: Response) => Promise<R>,
): Promise<R> {
    const controller = timeoutMs === undefined ? undefined : new AbortController();
    const timer = controller === undefined ? undefined : setTimeout(() => controller.abort(), timeoutMs);
    try {
        let response: Response;
        try {
            // Prevent stale GET/POST/binary responses and browser disk-cache reuse.
            const fetchInit: RequestInit = { ...init, cache: 'no-store' };
            response = await fetch(url, controller ? { ...fetchInit, signal: controller.signal } : fetchInit);
        } catch {
            // The original error is dropped on purpose: its message can contain the URL (and the token).
            throw new NetworkError(controller?.signal.aborted ? 'Request timed out' : 'Network request failed');
        }
        return await handle(response);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

async function readJson(response: Response): Promise<StatusResponse> {
    let text: string;
    try {
        text = await response.text();
    } catch {
        throw new NetworkError();
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new ApiError(response.status, INVALID_RESPONSE);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ApiError(response.status, INVALID_RESPONSE);
    }
    return parsed as StatusResponse;
}

function throwApiError(json: StatusResponse): never {
    throw new ApiError(json.code, json.message ?? 'Unknown error');
}

async function readApiJson<T extends StatusResponse>(response: Response): Promise<T> {
    const json = await readJson(response);
    if (json.status === 'error') throwApiError(json);
    return json as T;
}


export async function request<T extends StatusResponse>(
    command: string,
    params: Params = {},
    options: RequestOptions = {},
): Promise<T> {
    const { includeToken = true, includeAdminKey = false, context, timeoutMs } = options;
    const ctx = resolveContext(context);
    const url = buildGetUrl(ctx, command, params, includeToken, includeAdminKey);
    return execute(url, { headers: { ...ctx.headers } }, timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, (response) => readApiJson<T>(response));
}

export async function postRequest<T extends StatusResponse>(
    command: string,
    body: Record<string, unknown>,
    options: BodyOptions = {},
): Promise<T> {
    const ctx = resolveContext(options.context);
    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ctx.headers },
        body: JSON.stringify({ request: command, token: ctx.token, ...body }),
    };
    return execute(`${trimTrailingSlashes(ctx.baseUrl)}/`, init, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, (response) => readApiJson<T>(response));
}

export async function requestBinary(
    command: string,
    params: Params = {},
    options: BodyOptions = {},
): Promise<BinaryResult> {
    const ctx = resolveContext(options.context);
    const url = buildGetUrl(ctx, command, params, true, false);
    return execute(url, { headers: { ...ctx.headers } }, options.timeoutMs ?? DEFAULT_BINARY_TIMEOUT_MS, async (response) => {
        const contentType = response.headers.get('content-type');
        // A JSON body on a binary endpoint is an error response.
        if (contentType?.includes('application/json')) throwApiError(await readJson(response));
        let blob: Blob;
        try {
            blob = await response.blob();
        } catch {
            throw new NetworkError();
        }
        return { blob, contentType, contentDisposition: response.headers.get('content-disposition') };
    });
}
