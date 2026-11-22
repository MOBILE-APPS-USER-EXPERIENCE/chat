import {
    ApiError, DEFAULT_BINARY_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, NetworkError, NoApiContextError,
    postRequest, request, requestBinary, setActiveContext,
} from '../apiClient';

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
const realFetch = globalThis.fetch;

function fakeResponse(
    body: string | object,
    opts: { status?: number; contentType?: string; disposition?: string } = {},
): Response {
    const headers: Record<string, string> = {};
    if (opts.contentType) headers['content-type'] = opts.contentType;
    if (opts.disposition) headers['content-disposition'] = opts.disposition;
    return {
        status: opts.status ?? 200,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        text: async () => (typeof body === 'string' ? body : ''),
        blob: async () => body,
    } as unknown as Response;
}

const json = (value: unknown, status = 200) =>
    fakeResponse(JSON.stringify(value), { status, contentType: 'application/json' });
const ok = () => json({ status: 'ok', code: 200 });

function call(index = 0) {
    const [url, init] = fetchMock.mock.calls[index];
    const [base, queryString = ''] = url.split('?');
    return { url, base, query: new URLSearchParams(queryString), init: init ?? {} };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('Expected the promise to reject');
}

const CTX_A = { baseUrl: 'https://a.example/chat', token: 'tok-a', adminKey: 'key-a' };

beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setActiveContext(CTX_A);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    setActiveContext(null);
    jest.useRealTimers();
});

describe('request', () => {
    it('GET query contains request, token and params; the key only with includeAdminKey', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('getchats', { chatid: 3 });
        expect(call(0).base).toBe('https://a.example/chat/');
        expect(Object.fromEntries(call(0).query)).toEqual({ request: 'getchats', token: 'tok-a', chatid: '3' });
        await request('getchats', {}, { includeAdminKey: true });
        expect(call(1).query.get('key')).toBe('key-a');
    });

    it('skips undefined params', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('getmessages', { fromid: undefined, chatid: 0 });
        expect(call().query.has('fromid')).toBe(false);
        expect(call().query.get('chatid')).toBe('0');
    });

    it('sends no token with includeToken false', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('login', { userid: 'x' }, { includeToken: false });
        expect(call().query.has('token')).toBe(false);
    });

    it('sends the context headers', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('ping', {}, { context: { baseUrl: 'https://h.example', headers: { 'X-Access-Token': 'abc' } } });
        expect(call().init.headers).toEqual({ 'X-Access-Token': 'abc' });
    });

    it('uses a context override instead of the active one', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('ping', {}, { context: { baseUrl: 'https://b.example/', token: 'tok-b' } });
        expect(call().base).toBe('https://b.example/');
        expect(call().query.get('token')).toBe('tok-b');
    });

    it('throws NoApiContextError without any context and does not call fetch', async () => {
        setActiveContext(null);
        expect(await rejection(request('ping'))).toBeInstanceOf(NoApiContextError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a context change during an in-flight call does not affect it', async () => {
        let resolveFetch!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
        const pending = request('getchats');
        setActiveContext({ baseUrl: 'https://other.example', token: 'tok-other' });
        resolveFetch(ok());
        await pending;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(call().base).toBe('https://a.example/chat/');
        expect(call().query.get('token')).toBe('tok-a');
    });

    it('throws ApiError for status error', async () => {
        fetchMock.mockResolvedValue(json({ status: 'error', code: 456, message: 'Invalid token' }, 456));
        const error = await rejection(request('getchats'));
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ code: 456, message: 'Invalid token' });
    });

    it('turns an HTML body into ApiError(status, "Invalid server response")', async () => {
        fetchMock.mockResolvedValue(fakeResponse('<html>Not found</html>', { status: 404 }));
        const error = await rejection(request('ping'));
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ code: 404, message: 'Invalid server response' });
    });

    it('turns a timeout into NetworkError without URL or token in the message', async () => {
        fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                reject(Object.assign(new Error('aborted https://a.example/?token=tok-a'), { name: 'AbortError' }));
            });
        }));
        const error = await rejection(request('ping', {}, { timeoutMs: 10 }));
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).not.toMatch(/a\.example|tok-a/);
    });

    it('aborts a hung request after the default timeout with NetworkError', async () => {
        jest.useFakeTimers();
        fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                reject(Object.assign(new Error('aborted https://a.example/?token=tok-a'), { name: 'AbortError' }));
            });
        }));

        const pending = rejection(request('getchats'));
        jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS);
        const error = await pending;
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).toBe('Request timed out');
        expect((error as Error).message).not.toMatch(/a\.example|tok-a/);
    });

    it('uses an explicit timeoutMs instead of the request default', async () => {
        jest.useFakeTimers();
        const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
        fetchMock.mockResolvedValue(ok());

        await request('ping', {}, { timeoutMs: 1234 });
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
        setTimeoutSpy.mockRestore();
    });

    it('uses no-store cache policy for GET requests', async () => {
        fetchMock.mockResolvedValue(ok());
        await request('getchats');
        expect(call().init.cache).toBe('no-store');
    });

    it('turns a fetch rejection into NetworkError without URL or token in the message', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch https://a.example/chat/?token=tok-a'));
        const error = await rejection(request('ping'));
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).not.toMatch(/a\.example|tok-a/);
    });

    it('clears the timeout timer after a successful call', async () => {
        const clear = jest.spyOn(globalThis, 'clearTimeout');
        fetchMock.mockResolvedValue(ok());
        await request('ping', {}, { timeoutMs: 1000 });
        expect(clear).toHaveBeenCalled();
        clear.mockRestore();
    });
});

describe('postRequest', () => {
    it('sends request, token and body as JSON with the context headers', async () => {
        fetchMock.mockResolvedValue(ok());
        setActiveContext({ ...CTX_A, headers: { 'X-Access-Token': 'abc' } });
        await postRequest('postmessage', { text: 'hi', chatid: 0 });
        const { base, init } = call();
        expect(base).toBe('https://a.example/chat/');
        expect(init.method).toBe('POST');
        expect(init.cache).toBe('no-store');
        expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Access-Token': 'abc' });
        expect(JSON.parse(init.body as string)).toEqual({ request: 'postmessage', token: 'tok-a', text: 'hi', chatid: 0 });
    });
});

describe('requestBinary', () => {
    it('returns the blob and the headers', async () => {
        const blob = { size: 3 };
        fetchMock.mockResolvedValue(fakeResponse(blob, { contentType: 'image/png', disposition: 'attachment; filename="a.png"' }));
        const result = await requestBinary('getphoto', { photoid: 'p1' });
        expect(result).toEqual({ blob, contentType: 'image/png', contentDisposition: 'attachment; filename="a.png"' });
        expect(call().query.get('token')).toBe('tok-a');
        expect(call().init.cache).toBe('no-store');
    });

    it('uses a binary timeout larger than the request default', async () => {
        jest.useFakeTimers();
        const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
        fetchMock.mockResolvedValue(fakeResponse({ size: 3 }, { contentType: 'image/png' }));

        await requestBinary('getphoto', { photoid: 'p1' });
        expect(DEFAULT_BINARY_TIMEOUT_MS).toBeGreaterThan(DEFAULT_REQUEST_TIMEOUT_MS);
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), DEFAULT_BINARY_TIMEOUT_MS);
        setTimeoutSpy.mockRestore();
    });

    it('turns a JSON error body into ApiError', async () => {
        fetchMock.mockResolvedValue(json({ status: 'error', code: 457, message: 'Invalid photoid' }, 457));
        expect(await rejection(requestBinary('getphoto', { photoid: 'x' }))).toMatchObject({
            name: 'ApiError', code: 457, message: 'Invalid photoid',
        });
    });
});
