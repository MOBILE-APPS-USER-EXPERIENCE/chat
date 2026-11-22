/**
 * Web storage environment probe. All `globalThis` access happens lazily inside the function —
 * never at import time — because the web build is statically exported and evaluated in Node
 * during `expo export`, where `navigator` and friends do not exist.
 */

export type StorageEnvironment =
    | { kind: 'native' }
    | {
        kind: 'web';
        crossOriginIsolated: boolean;
        isSecureContext: boolean;
        hasSharedArrayBuffer: boolean;
        hasOpfs: boolean;
    };

export function createStorageEnvironment(): StorageEnvironment {
    const scope = globalThis as {
        crossOriginIsolated?: boolean;
        isSecureContext?: boolean;
        SharedArrayBuffer?: unknown;
        navigator?: { storage?: { getDirectory?: unknown } };
    };
    return {
        kind: 'web',
        crossOriginIsolated: scope.crossOriginIsolated === true,
        isSecureContext: scope.isSecureContext === true,
        hasSharedArrayBuffer: typeof scope.SharedArrayBuffer === 'function',
        hasOpfs: typeof scope.navigator?.storage?.getDirectory === 'function',
    };
}
