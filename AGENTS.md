# AGENTS.md

Chat client for the HSE PHP chat server: Expo / React Native / Tamagui / TypeScript.
Targets: iOS, Android, Web (static export served by nginx in Docker).

This file is for AI agents **and** humans. Humans own every line that lands in this repo.

## Working agreement (read first)

1. **The human must be able to explain the result.** Do not produce code the requester
   could not maintain without AI. If you use a concept, API or pattern that does not
   already exist in this repo, explain it in 2–4 sentences (what, why, where to read more).
2. **Smallest change that solves the task.** No drive-by refactors, renames, formatting
   sweeps or dependency bumps. Mention other findings in your summary instead of fixing them.
3. **Follow existing patterns.** Read two similar files before writing a new one.
4. **Ask before you:**
   - add or upgrade a dependency
   - introduce a new folder structure or architectural pattern
   - edit `src/api/**`, CI (`.github/`), `Dockerfile`, `nginx.conf` or `app.json`
   - do anything that contradicts an ADR in `docs/adr/`
   - define a message "envelope" format (see "Features beyond the API")
5. **Never guess API behavior.** Source of truth: `docs/openapi.yaml` and `src/api/*`.
   If something is not specified there, say so and ask. Do not invent endpoints or fields.
6. **No silent failures.** No empty `catch`, no `as any`, no `@ts-ignore` / `eslint-disable`
   without a comment explaining why. Always `await` promises or deliberately `void` them
   with a reason. Show errors to the user via `ApiError.message`.
7. **Verify, then report honestly.** Run `npx tsc --noEmit` and `npm run lint`.
   If you could not run something, say so. Never claim "done" or "tested" without evidence.
8. **Finish every task with a summary** (format at the bottom).

## Project facts

- Package manager: **npm** (`package-lock.json`). Do not use bun/yarn/pnpm.
- Versions: see `package.json` (Expo SDK, React Native, Tamagui). Do not trust memory.
- Backend: one dispatch endpoint (`GET /?request=<cmd>`), errors are returned as HTTP
  status codes (451–469), no WebSocket and no push. The app polls (5 s).
  Details: `docs/ai-use/api-services.md`.
- Server selection: explicit, no failover. The user picks a server; both defaults are seeded into
  the registry on first start. The `X-Access-Token` header is only sent to the default server.
- Secrets (token, admin key) live in the `SecretStore` (`src/storage/secret/`), never in AsyncStorage.
  The registry holds only non-secret data.
- Language: UI strings are German; identifiers, comments and commit messages are English.

## Repo map

- `src/app/` – Expo Router screens only (`(auth)/login`, `(auth)/register`, `index`, `profile`).
  `_layout.tsx` guards the routes with `Stack.Protected`.
- `src/api/` – hand-written API client
  - `apiClient.ts`: stateless `request`, `postRequest`, `requestBinary`, `ApiError`; the active
    `ApiContext` is set by the session layer
  - `*Service.ts`: one file per domain (auth, chat, message, invite, user, admin, connectivity)
  - `serverSettings.ts`: change/reset server
  - `types.ts`: types derived by hand from `docs/openapi.yaml`
- `src/session/` – servers, accounts, login/register/logout/deregister, session restore
- `src/storage/` – ports, memory implementations, KV registry, `SecretStore`, and (in progress)
  the SQLite account database under `src/storage/db/`
- `src/components/` – reusable UI (e.g. `confirm-dialog.tsx`)
- `src/constants/layout.ts` – `Spacing` scale
- `src/hooks/`, `src/utils/` – hooks and helpers
- `src/tamagui.config.ts` – theme and tokens
- `docs/adr/` – decisions; `docs/ai-use/` – documentation of AI-assisted design work
- `export_issues.md` – snapshot of the backlog. The issue tracker is the source of truth.

## Commands

```bash
npm install                 # install from lockfile
npx expo install <package>  # ALWAYS use this to add packages (SDK-compatible versions)
npx expo start              # dev server
npm run web                 # web
npx tsc --noEmit            # typecheck
npm run lint                # lint
npx expo-doctor             # diagnose dependency/config issues
npx expo install --fix      # fix incompatible versions
```

## Expo rules

Expo ships breaking changes every SDK release. Before touching an Expo/EAS/React Native API:

1. Read the major version of `expo` in `package.json`.
2. Fetch the matching docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else use https://docs.expo.dev/llms.txt. Do not answer from memory.

- Navigation: Expo Router only. Every file in `src/app/` is a route; keep non-route code outside it.
  Import `Link`, `router`, `useLocalSearchParams` from `expo-router`.
- `ios/` and `android/` are generated (Continuous Native Generation). Never create or edit them.
  Configure native behavior in `app.json` / config plugins.
- Expo Go only contains bundled native modules. New native libraries need a development build.
- Prefer Expo modules over third-party libraries.
- Environment variables prefixed `EXPO_PUBLIC_` are **inlined into the public bundle**.
  Never put real secrets in them, and never commit `.env` files.

## API layer rules

- Layering: **screen → service → `apiClient`**. Screens never call `fetch` or `request` directly.
- New endpoint = check `docs/openapi.yaml` → add type to `types.ts` → add function to the
  matching `*Service.ts`. Keep types in sync with the spec.
- Never log or display the token or admin key.
- Error handling: catch `ApiError`, show `message`. Code 456 means invalid token (log in again);
  459 means invalid admin key, which the caller handles with `session.lockAdmin()`.
- If a change to `src/api/**` is AI-designed, add or update a short note in `docs/ai-use/`.

## UI rules (Tamagui)

- Use Tamagui components (`YStack`, `XStack`, `Text`, `H1`–`H6`, `Button`, `Input`, `Label`,
  `Form`, `Sheet`, `Dialog`, `Adapt`, `Spinner`, `ScrollView`, ...).
- Colors come from theme keys defined in `src/tamagui.config.ts`
  (`background`, `backgroundElement`, `backgroundSelected`, `text`, `textSecondary`,
  `accent`, `accentContrast`, `error`, `errorBackground`, `errorText`).
  Spacing comes from `Spacing` in `src/constants/layout.ts`. Do not add new hex/rgba values.
- Use the prop style already used in screens (`items`, `justify`, `px`, `self`, `backgroundColor`, ...).
  Do not mix in the old `alignItems` / `justifyContent`.
- No `StyleSheet.create`, no inline `style={{}}`, no RN `View`/`Text`/`TextInput`/`Pressable`.
  Allowed: `FlatList`/`FlashList`, navigation primitives, `KeyboardAvoidingView`.
- No new "themed-*" wrapper components.
- No `Platform.OS` checks and no `.ios`/`.android` files, except `expo-haptics` calls and
  `use-color-scheme.web.ts`.
- Icons: `@tamagui/lucide-icons` only.
- Destructive actions (delete, reset, clear) need a confirmation via `ConfirmDialog`.

## Features beyond the API (client conventions)

The server cannot do: edit/delete messages, reactions, read receipts, avatars, tags,
sub-groups, write-protected (broadcast) chats, or push. Backlog items for these are
**client-side conventions**, not enforced rules (see comments in `export_issues.md`).

- Never present such a feature as secure or enforced in code, comments or UI text.
- The **envelope format** (structured events inside `text`) is **not defined yet**.
  Do not invent one. It needs an ADR with the next free ADR number in `docs/adr/`
  (adr-003 and adr-004 are taken) written by the team first.
- Reference the issue number in your summary and commit message.
- Real push notifications are not possible with this API. Do not add push libraries.

## Testing

- Jest is set up (`npm test`, `jest-expo` preset, tests live next to the code as `*.test.ts`).
  Do not add another framework without asking.
- Pure logic (parsing, formatting, envelopes) must have unit tests.

## Known deviations (do not copy these)

- `confirm-dialog.tsx`: hardcoded `rgba(...)` and numeric sizes
- `login.tsx` / `register.tsx`: `KeyboardAvoidingView` with inline `style`; placeholder `onSubmitEditing={() => undefined}`
- `profile.tsx`: `logout()` / `deregister()` not awaited, placeholder "test" button

## Summary format for every task

```text
Goal: <1 line, issue # if any>
Changed: <files + 1 line each>
Why this way: <key decisions, alternatives rejected>
New concepts: <anything new the team should learn, with doc link>
Verified: tsc <ok/fail>, lint <ok/fail>, manual test <what/where>
Not done / open questions: <...>
```
