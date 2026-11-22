## AI Use Case: TypeScript Client for the Chat API

**Context:** The provided `openapi.yaml` describes a technically non-RESTful API (a single dispatch endpoint, error codes as HTTP status, inconsistent authentication). Automatically generated clients (tested: `openapi-generator-cli`) produced unusable code full of optionals and without meaningful request logic.

**Decision:** Together with the AI, we weighed the pros and cons of code generation versus a manual/AI-assisted implementation. Since the API would not change during the project, we decided against code generation and in favor of a lean, hand-designed client.

**Approach:** A React Native/TypeScript client was iteratively developed using AI:

1. **Core Client (`apiClient.ts`)**

- Central `request()` function for GET dispatch via `?request=<command>`

- `postRequest()` as a special case for the single POST endpoint (`postmessage`)

- `requestBinary()` for the two non-JSON endpoints (`getphoto`, `getfile`)

- Consistent error handling via a single `ApiError` class (`code`, `message`)

- Request timeouts: regular GET and POST calls default to 15,000 ms (`DEFAULT_REQUEST_TIMEOUT_MS`), binary calls default to 60,000 ms (`DEFAULT_BINARY_TIMEOUT_MS`), and callers may override the timeout with `timeoutMs`. Fetches use `cache: 'no-store'` for GET, POST and binary requests to avoid stale or disk-cached responses, especially for chat/message polling.

- Stateless client: `apiClient.ts` holds no persistence. Every call resolves an `ApiContext` (`baseUrl`, `token`, `adminKey`, extra `headers`) once at its start, either from `options.context` or from the active context set by the session layer (`setActiveContext`). Without a context it throws `NoApiContextError`; network failures and timeouts become `NetworkError` (never containing URL, token or key); non-JSON bodies become `ApiError(status, 'Invalid server response')`.

- **Servers:** The default and backup server are independent instances with separate user databases. There is no failover: a token only works on the server that issued it. Server list, accounts, token and admin key live in `src/storage` and are managed by `src/session`.

- **Access header:** `X-Access-Token` (from `EXPO_PUBLIC_X_ACCESS_TOKEN`) is added by `src/session/serverHeaders.ts` to the context of the default server only. It is not a secret because `EXPO_PUBLIC_*` values end up in the client bundle.

- Admin key: `session.unlockAdmin(key)` stores it per account; the server validates it on the first admin call. On error 459 the caller should call `session.lockAdmin()`.

2. **Business Services**, one file per domain, all built on top of the core client:

- `authService.ts`: all functions take an explicit `ApiContext` first and do no persistence. `unlockAdmin` is gone.

- `messageService.ts` (postMessage, getMessages, getPhoto, getFile)

- `chatService.ts` (getChats, createChat, deleteChat, joinChat, leaveChat)

- `inviteService.ts` (invite, getInvites, rejectInvite)

- `userService.ts` (getProfiles)

- `connectivityService.ts` (ping, pingContext)

- `serverSettings.ts` moved to `src/session`.

- `adminService.ts` (resetUser, deleteUser, clear)

3. **Common types (`types.ts`)**, manually derived from the specification instead of generated, including cleanup of redundant schemas (`Profile`/`ChatParticipant` -> common `User` type).


**Design decisions made through dialogue:**

- Token and admin key management are separate but automatically attached to requests via a common mechanism in the core client.

- A unified, generic `ApiError` instead of many specific error classes simplifies UI feedback.

- A configurable server base URL (default + persistent override function) for deployment flexibility.

**Result:** A compact, type-safe, manually traceable API client that explicitly reflects the characteristics of the server API (dispatch pattern, error codes as status, admin key mechanics, binary endpoints) instead of obscuring them with a generator -- with significantly less boilerplate and optionals than generated code.
