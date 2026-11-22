import { parseServerUrl, type ServerUrlFailure } from './serverUrl';

export type CheckServerResult =
    | { status: 'invalid'; reason: ServerUrlFailure }
    | { status: 'ok'; url: string }
    | { status: 'unreachable'; url: string };

export type AddServerResult =
    | { status: 'invalid'; reason: ServerUrlFailure }
    | { status: 'added'; url: string }
    | { status: 'existing'; url: string };

export type AddServerDeps = {
    listServerUrls: () => Promise<readonly string[]>;
    changeServer: (url: string) => Promise<void>;
};

/** Parses the input; pings only a valid URL. Errors thrown by `ping` propagate. */
export async function checkServerUrl(
    input: string,
    ping: (url: string) => Promise<boolean>,
): Promise<CheckServerResult> {
    const parsed = parseServerUrl(input);
    if (!parsed.ok) return { status: 'invalid', reason: parsed.reason };
    const reachable = await ping(parsed.url);
    return reachable
        ? { status: 'ok', url: parsed.url }
        : { status: 'unreachable', url: parsed.url };
}

/** Adds (if new) and selects the server. Reports whether the URL was already registered. */
export async function addAndSelectServer(
    input: string,
    deps: AddServerDeps,
): Promise<AddServerResult> {
    const parsed = parseServerUrl(input);
    if (!parsed.ok) return { status: 'invalid', reason: parsed.reason };
    const existing = (await deps.listServerUrls()).includes(parsed.url);
    await deps.changeServer(parsed.url);
    return { status: existing ? 'existing' : 'added', url: parsed.url };
}
