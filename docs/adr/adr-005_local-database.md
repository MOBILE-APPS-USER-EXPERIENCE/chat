# ADR-005: Local database (SQLite + Drizzle)

- Status: **Accepted**
- Verified on: Expo SDK 58 (`expo@58.0.26`, `expo-sqlite@58.0.18`)
- Related: ADR-001 (no plain AsyncStorage for secrets), ADR-003 (web secret storage),
  ADR-004 (session and server model), `docs/db-model.dbml`, `src/storage/db/`

## Context

The app is offline-first: chats, members, profiles and raw messages must be readable without a
network round trip, and the server has no WebSocket and no push, so the client polls and stores
what it saw. Until now the only persistence was key/value (`src/storage/kv.ts`) and the in-memory
ports. Next Step needs real tables, indexes and transactions.

Decision drivers:

- **Web is mandatory.** The app ships a static web export served by nginx in Docker. A solution
  that only works on iOS and Android is not acceptable.
- **Mobile is the primary target.** iOS and Android must not be second-class.
- **Offline-first.** Reads must work from disk, writes must be transactional.
- **E2EE later.** The database will eventually hold decrypted plaintext, so the storage layer must
  be replaceable and must not assume the server can read the data.

This ADR records the accepted local database implementation, including its repositories.

## Findings

### 1. Web support status, required config, underlying storage

`expo-sqlite` supports web. On SDK 57 the docs marked it **alpha** ("Web support is in alpha and
may be unstable"); that warning is **gone from the SDK 58 docs**, so web is no longer labelled
alpha. It still requires three things beyond a plain install:

- Metro must treat `wasm` as an asset extension (`config.resolver.assetExts.push('wasm')`).
- The page must be **cross-origin isolated**, because the synchronous API blocks the main thread on
  a `SharedArrayBuffer` + `Atomics` handshake with a worker. That means
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`
  (or `require-corp`).
- A secure context (HTTPS or `localhost`), because `SharedArrayBuffer` and OPFS are gated on it.

The underlying storage is **OPFS** (Origin Private File System), not IndexedDB: the bundled
wa-sqlite `AccessHandlePoolVFS` calls `navigator.storage.getDirectory()` and
`createSyncAccessHandle()`. `:memory:` databases use a separate `MemoryVFS`.

Source: <https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/> (section "Web setup"),
verified in `node_modules/expo-sqlite/web/wa-sqlite/AccessHandlePoolVFS.js`.

### 2. Sync API on web

Yes. `openDatabaseSync`, `prepareSync`, `executeSync` and `getAllSync` are all listed as supported
on Web. The web build runs SQLite inside a worker and the "sync" calls block the calling thread
until the worker answers, which is exactly why cross-origin isolation is mandatory.

`withExclusiveTransactionAsync` is **not** supported on web (it opens a second connection, and
pragmas such as `foreign_keys` do not carry over). `withTransactionAsync` is supported.

Source: <https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/> (platform support table).

### 3. Drizzle driver per platform, transaction support

`drizzle-orm/expo-sqlite` is the driver for all three platforms. It is **sync-only**: it uses
`SQLiteSyncDialect`, `client.prepareSync` and `stmt.executeSync`. `db.transaction()` issues
`begin` / `commit` / `rollback` through the session, so it is atomic and works on web, iOS and
Android. There is no separate web driver to choose.

Source: <https://orm.drizzle.team/docs/connect-expo-sqlite>,
verified in `node_modules/drizzle-orm/expo-sqlite/{driver,session}.js`.

### 4. Drizzle Expo migration flow

- `drizzle.config.ts` with `dialect: 'sqlite'`, `driver: 'expo'`, `schema` and `out`.
- `npx drizzle-kit generate` writes `<tag>.sql`, `meta/_journal.json`, `meta/<tag>_snapshot.json`
  and a `migrations.js` that imports the journal and every `.sql` file.
- The `.sql` files are imported as **strings**, which needs `babel-plugin-inline-import` with
  `extensions: ['.sql']` in `babel.config.js` and `sql` in Metro's `sourceExts`.
- At runtime `migrate(db, migrations)` from `drizzle-orm/expo-sqlite/migrator` applies pending
  migrations inside `BEGIN` / `COMMIT` and records them in `__drizzle_migrations`. The
  `useMigrations` hook is the React wrapper.

Source: <https://orm.drizzle.team/docs/kit-overview>,
<https://orm.drizzle.team/docs/migrations>.

### 5. `PRAGMA foreign_keys` default, WAL on web

`foreign_keys` is **off by default** in SQLite and is a per-connection setting, so the opener sets
`PRAGMA foreign_keys = ON` immediately after opening. `expo-sqlite`'s web `initDb` does not set it.

WAL is **not usable on web**: the wa-sqlite VFS implements no `xShmMap` / `xShmLock`, so the shared
memory WAL needs is unavailable. The opener therefore does not enable WAL on any platform, which
keeps behaviour identical across platforms.

Source: <https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/>,
<https://www.sqlite.org/wal.html>, verified in `AccessHandlePoolVFS.js`.

### 6. Deleting a database file

`SQLite.deleteDatabaseAsync(name)` works on all three platforms. Android and iOS throw
`Database '<name>' not found` when the file does not exist; on web the delete is a no-op that
returns `SQLITE_OK`. `deleteAccountDatabase` therefore treats a "not found" error as success and
is idempotent.

Source: <https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/> (`deleteDatabaseAsync`).

### 7. Expo Go

`expo-sqlite` **is** included in Expo Go, so the spike runs there without a development build.
SQLCipher is not included, which is one reason this step does not encrypt.

Source: <https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/> (platform list includes `expo-go`).

## Options

| Option                                     | Web                                                  | iOS/Android       | Verdict                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **expo-sqlite + Drizzle** (as built)       | Works, needs wasm asset + COOP/COEP + secure context | Works, in Expo Go | **Chosen for the spike.** One schema, one migration set, one query API on all platforms.                   |
| Thin SQL wrapper without Drizzle           | Same runtime requirements                            | Same              | Rejected: loses typed schema, migration generation and the `AccountDb` type the next step builds on.       |
| IndexedDB behind the repository interfaces | Native browser API, no isolation needed              | Not available     | Rejected: a second storage engine and a second query language, and no transactions across the same schema. |
| Memory-only fallback on web                | Always works                                         | n/a               | Kept as the **degradation path** (see below), not as the primary.                                          |

## Web hosting requirements (proposal only)

The static export must be served with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless` is the weaker of the two COEP values and is what the Expo docs recommend; it lets
cross-origin subresources load without a `Cross-Origin-Resource-Policy` header, at the cost of
sending them no credentials. `require-corp` would additionally require every cross-origin response
to opt in.

The page must be a **secure context**: HTTPS, or `localhost` during development. A plain-http LAN
deployment (`http://192.168.x.x`) is not a secure context, so `SharedArrayBuffer` is unavailable
and the database cannot open.

Proposed `nginx.conf` change:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;

    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|svg|ico|woff2?|wasm)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        # `add_header` in a location replaces the inherited server-level headers, so the
        # isolation headers must be repeated here or the JS/wasm responses lose them.
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "credentialless" always;
    }
}
```

Two details that matter:

- `add_header` inside a `location` **replaces** the inherited server-level headers instead of
  adding to them. The static-file block above therefore repeats the two headers; without that the
  bundle and the wasm file would be served without them and the app would not be isolated.
- `.wasm` is not in the current regex, and nginx's default `mime.types` may not map it to
  `application/wasm`. It is added to the regex above; if the image's `mime.types` lacks the entry,
  add `types { application/wasm wasm; }` as well.

## Risks

- **COEP vs. cross-origin chat servers.** The chat servers are cross-origin and are called with a
  custom `X-Access-Token` header. Under `credentialless` a cross-origin `fetch` is still allowed,
  but the request is sent without credentials and the response must not require them. This was
  **not verified in a browser** during the spike: the spike screen never talks to a server. It must
  be checked with checklist item 6 before this ADR is accepted.
- **Multiple tabs.** Two tabs share one OPFS file. The wa-sqlite VFS has no shared-memory locking,
  so concurrent writers can see `SQLITE_BUSY` or interleave. The spike does not coordinate tabs.
- **Storage eviction.** OPFS is subject to browser storage pressure. `navigator.storage.persist()`
  should be requested; the spike only reports whether it is available.
- **Plain-http LAN.** No secure context, no `SharedArrayBuffer`, no database (see above).
- **Web requirements can still change.** The alpha label is gone in SDK 58, but web support is
  younger than the native one and the wasm/COOP/COEP requirements are not part of a stability
  promise. Re-check the "Web setup" section on every SDK upgrade.
- **Dev-server bug in SDK 57 — resolved in SDK 58.** On SDK 57 any route that imported
  `expo-sqlite` made `expo start --web` return HTTP 500 with
  `Worker chunk not found for: .../expo-sqlite/web/worker.ts`
  ([expo/expo#50153](https://github.com/expo/expo/issues/50153)): Metro's lazy bundling could not
  produce the worker chunk and the assertion in `@expo/metro-config` aborted serialization. It was
  not caused by this repo's config — a bare `import * as SQLite from 'expo-sqlite'` in a route
  reproduced it, and it still reproduced with no `metro.config.js` at all. The assertion is gone in
  `@expo/metro-config@58.0.23`, and on SDK 58 `expo start --web` serves `/` and the development
  spike route (removed after acceptance) with HTTP 200 **without** `EXPO_NO_METRO_LAZY`. No
  workaround is needed any more.
- **Open risk.** iOS was not tested manually because no hardware was available; automated tests run
  against `better-sqlite3` only.

## Proposed degradation

If web persistence is unavailable, the app should still start and be usable, just without local
storage. The capability check would be, in order:

1. `typeof SharedArrayBuffer !== 'undefined'` and `globalThis.crossOriginIsolated === true`
2. `globalThis.isSecureContext === true`
3. `navigator.storage?.getDirectory` exists
4. opening and migrating a throwaway database succeeds

If any step fails, fall back to `MemoryAccountStorageFactory` and show a persistent notice:
"data is not stored on this device". This is **described only**; it is not implemented in this
step.

## Repositories and degradation (implementation)

The repositories (`ChatRepository`, `ProfileRepository`, `MessageRepository`) are implemented on
the sync Drizzle driver in `src/storage/db/sqlite*.ts` and are proven by the same contract tests
that the memory implementation passes (`src/storage/__tests__/contracts/`). The Node tests use
`better-sqlite3` over the shared `SqliteDb` type (`BaseSQLiteDatabase<'sync', unknown, typeof
schema>`), which both drivers satisfy without casts.

Rules the implementations follow:

- **Never `INSERT OR REPLACE` on `chats`.** Replacing the parent row cascades and deletes the
  chat's messages. Snapshot re-apply uses `INSERT ... ON CONFLICT(id) DO UPDATE` with the snapshot
  fields only; `firstSeenAt`, `polledUpTo` and `lastPolledAt` are never part of the update.
- **Transactions are synchronous.** The ports are async, but every Drizzle transaction callback
  runs synchronously (both drivers), so a rejected batch rolls back completely and changes
  nothing.
- **Backend selection** (`src/storage/accountStorageManager.ts`): resolved once, lazily, on the
  first `open`/`destroy`. Native always uses SQLite and propagates open errors. Web checks the
  capabilities in the order above; a missing one degrades to memory with the reason
  `no_isolation`, `no_secure_context` or `no_opfs` without ever loading the SQLite backend. With
  all capabilities present the first open is a trial: if it throws, the app degrades to memory
  with reason `open_failed` (the error message is kept in the status, not swallowed). After
  resolution the mode never changes.
- **Pending deletions.** `destroy` must not break deregistration: a failed deletion is recorded
  in the KV store under `storage.pendingDeletions` and retried before the next open. A re-opened
  account is removed from the list.

## Limitation: no encryption

The database is **not encrypted**. There is no SQLCipher in this step, so decrypted plaintext sits
in the app's private storage on iOS/Android and in the browser's OPFS profile on web. It is only as
safe as the device or browser profile. This must be revisited before E2EE data is stored.

## Manual test results

All rows below were verified manually except the iOS (Expo Go) rows, which were not tested because
no hardware was available. `npx expo start --web` works without any environment variable on SDK 58
(see Risks).

| #   | Platform                                                    | Check                                                                                                               | Result |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Web (Chrome)                                                | Spike: Open + migrate succeeds; driver and capabilities shown                                                       | ✔      |
| 2   | Web (Chrome)                                                | Write, reload, Read: data still there                                                                               | ✔      |
| 3   | Web (Chrome)                                                | Two tabs: Write in one, Read in the other; note errors or locks                                                     | ✔      |
| 4   | Web (Chrome)                                                | Delete DB, reload, Open + migrate: DB is empty again                                                                | ✔      |
| 5   | Web (Chrome)                                                | Cascade test works                                                                                                  | ✔      |
| 6   | Web (Chrome)                                                | Normal login against a chat server still works with COOP/COEP active                                                | ✔      |
| 1   | Web (Firefox)                                               | Spike: Open + migrate succeeds; driver and capabilities shown                                                       | ✔      |
| 2   | Web (Firefox)                                               | Write, reload, Read: data still there                                                                               | ✔      |
| 3   | Web (Firefox)                                               | Two tabs: Write in one, Read in the other; note errors or locks                                                     | ✔      |
| 4   | Web (Firefox)                                               | Delete DB, reload, Open + migrate: DB is empty again                                                                | ✔      |
| 5   | Web (Firefox)                                               | Cascade test works                                                                                                  | ✔      |
| 6   | Web (Firefox)                                               | Normal login against a chat server still works with COOP/COEP active                                                | ✔      |
| 1   | Web (static export + proposed headers)                      | Spike: Open + migrate succeeds; driver and capabilities shown                                                       | ✔      |
| 2   | Web (static export + proposed headers)                      | Write, reload, Read: data still there                                                                               | ✔      |
| 3   | Web (static export + proposed headers)                      | Two tabs: Write in one, Read in the other; note errors or locks                                                     | ✔      |
| 4   | Web (static export + proposed headers)                      | Delete DB, reload, Open + migrate: DB is empty again                                                                | ✔      |
| 5   | Web (static export + proposed headers)                      | Cascade test works                                                                                                  | ✔      |
| 6   | Web (static export + proposed headers)                      | Normal login against a chat server still works with COOP/COEP active                                                | ✔      |
| 1   | Android (Expo Go)                                           | Spike: Open + migrate succeeds; driver and capabilities shown                                                       | ✔      |
| 2   | Android (Expo Go)                                           | Write, kill and restart the app, Read: data still there                                                             | ✔      |
| 3   | Android (Expo Go)                                           | Cascade test works                                                                                                  | ✔      |
| 4   | Android (Expo Go)                                           | Delete DB, restart, Open + migrate: DB is empty again                                                               | ✔      |
| 1   | iOS (Expo Go)                                               | Spike: Open + migrate succeeds; driver and capabilities shown                                                       | not tested (no hardware) |
| 2   | iOS (Expo Go)                                               | Write, kill and restart the app, Read: data still there                                                             | not tested (no hardware) |
| 3   | iOS (Expo Go)                                               | Cascade test works                                                                                                  | not tested (no hardware) |
| 4   | iOS (Expo Go)                                               | Delete DB, restart, Open + migrate: DB is empty again                                                               | not tested (no hardware) |
| 1   | Web (Chrome)                                                | Repos: status shows `sqlite`; Write via repos, reload, Read via repos: data still there                             | ✔      |
| 2   | Web (Chrome)                                                | Repos: Purge chat 1: chat 1 + messages gone, chat 2 remains                                                         | ✔      |
| 3   | Web (Chrome)                                                | Repos: Delete account storage, reload, Read via repos: empty                                                        | ✔      |
| 4   | Web (Chrome)                                                | Repos: Two tabs: write in one, read in the other; note errors                                                       | ✔      |
| 1   | Web (Firefox)                                               | Repos: status shows `sqlite`; Write via repos, reload, Read via repos: data still there                             | ✔      |
| 2   | Web (Firefox)                                               | Repos: Purge chat 1: chat 1 + messages gone, chat 2 remains                                                         | ✔      |
| 3   | Web (Firefox)                                               | Repos: Delete account storage, reload, Read via repos: empty                                                        | ✔      |
| 4   | Web (Firefox)                                               | Repos: Two tabs: write in one, read in the other; note errors                                                       | ✔      |
| 1   | Web (static export, no isolation headers, `npx serve dist`) | Repos: status shows `memory` with reason `no_isolation`; app starts, login works, data gone after reload (expected) | ✔      |
| 2   | Web (static export, no isolation headers, `npx serve dist`) | Repos: Write via repos, reload, Read via repos: empty again (memory mode)                                           | ✔      |
| 1   | Android (Expo Go)                                           | Repos: status shows `sqlite`; Write via repos, kill and restart, Read via repos: data still there                   | ✔      |
| 2   | Android (Expo Go)                                           | Repos: Purge chat 1: chat 1 + messages gone, chat 2 remains                                                         | ✔      |
| 3   | Android (Expo Go)                                           | Repos: Delete account storage, restart, Read via repos: empty                                                       | ✔      |
| 1   | iOS (Expo Go)                                               | Repos: status shows `sqlite`; Write via repos, kill and restart, Read via repos: data still there                   | not tested (no hardware) |
| 2   | iOS (Expo Go)                                               | Repos: Purge chat 1: chat 1 + messages gone, chat 2 remains                                                         | not tested (no hardware) |
| 3   | iOS (Expo Go)                                               | Repos: Delete account storage, restart, Read via repos: empty                                                       | not tested (no hardware) |

## Consequences

- `expo-sqlite`, `drizzle-orm`, `drizzle-kit`, `babel-plugin-inline-import` and (for Node tests)
  `better-sqlite3` are now dependencies.
- `metro.config.js` and `babel.config.js` exist and must keep the wasm asset extension, the `sql`
  source extension, the inline-import plugin and the dev-server isolation headers.
- Web deployments must serve the two isolation headers and HTTPS, or the database will not open.
- The schema in `src/storage/db/schema.ts` is the source of truth for migrations; `docs/db-model.dbml`
  must be kept in sync with it.
- Verified on Expo SDK 58 (`expo@58.0.26`, `expo-sqlite@58.0.18`, `@expo/metro-config@58.0.23`):
  typecheck, lint, 178 tests, `expo export -p web` and `expo start --web` all pass, the last one
  without any environment variable.
- Repositories are built on `AccountDb` and `openAccountDatabase`.
