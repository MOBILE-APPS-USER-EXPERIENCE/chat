## AI Use Case: TypeScript Client for the Chat API

**Context:** The provided `openapi.yaml` describes a technically non-RESTful API (a single dispatch endpoint, error codes as HTTP status, inconsistent authentication). Automatically generated clients (tested: `openapi-generator-cli`) produced unusable code full of optionals and without meaningful request logic.

**Decision:** Together with the AI, we weighed the pros and cons of code generation versus a manual/AI-assisted implementation. Since the API would not change during the project, we decided against code generation and in favor of a lean, hand-designed client.

**Approach:** A React Native/TypeScript client was iteratively developed using AI:

1. **Core Client (`apiClient.ts`)**

- Central `request()` function for GET dispatch via `?request=<command>`

- `postRequest()` as a special case for the single POST endpoint (`postmessage`)

- `requestBinary()` for the two non-JSON endpoints (`getphoto`, `getfile`)

- Consistent error handling via a single `ApiError` class (`code`, `message`)

- Persistent state for token, admin key, and base URL via `AsyncStorage`, ensuring login status, admin mode, and server configuration persist across application restarts

2. **Business Services**, one file per domain, all built on top of the core client:

- `authService.ts` (register, login, logout, deregister, validateToken, unlock admin key)

- `messageService.ts` (postMessage, getMessages, getPhoto, getFile)

- `chatService.ts` (getChats, createChat, deleteChat, joinChat, leaveChat)

- `inviteService.ts` (invite, getInvites, rejectInvite)

- `userService.ts` (getProfiles)

- `serverService.ts` (ping)

- `adminService.ts` (resetUser, deleteUser, clear) including automatic reset of the admin key if the key is invalid (error code 459)

3. **Common types (`types.ts`)**, manually derived from the specification instead of generated, including cleanup of redundant schemas (`Profile`/`ChatParticipant` -> common `User` type).


**Design decisions made through dialogue:**

- Token and admin key management are separate but automatically attached to requests via a common mechanism in the core client.

- A unified, generic `ApiError` instead of many specific error classes simplifies UI feedback.

- A configurable server base URL (default + persistent override function) for deployment flexibility.

**Result:** A compact, type-safe, manually traceable API client that explicitly reflects the characteristics of the server API (dispatch pattern, error codes as status, admin key mechanics, binary endpoints) instead of obscuring them with a generator -- with significantly less boilerplate and optionals than generated code.
