// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a wasm build of SQLite (wa-sqlite) that Metro must treat as an asset.
config.resolver.assetExts.push('wasm');

// Drizzle migrations are imported as `.sql` strings (see babel.config.js).
config.resolver.sourceExts.push('sql');

// expo-sqlite's web implementation runs SQLite in a worker and uses SharedArrayBuffer for its
// synchronous API, which browsers only expose in a cross-origin isolated context.
config.server.enhanceMiddleware = (middleware) => {
    return (req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        middleware(req, res, next);
    };
};

module.exports = config;
