# AI Use Case: Local Storage, Sessions and Messaging

## Context

The app targets iOS, Android and web and uses a fixed HTTP chat server. The
project needs local persistence, secure token storage on mobile, polling and
eventually offline message sending. The server is used as provided; features
such as E2EE and message events are planned separately.

## How AI was used

The team used a chat assistant to discuss requirements, compare storage options,
design interfaces and break the work into implementation steps. The assistant
also prepared prompts for an AI coding agent or chatbot and helped review their
reports.

AI-assisted work included:

- Designing a per-account local database and separating the API client, session,
  storage repositories and messaging layers.
- Implementing in-memory repositories and tests, followed by an
  `expo-sqlite` and Drizzle spike, migrations and SQLite repositories.
- Designing mobile secret storage with `expo-secure-store` and an interim web
  implementation using `localStorage`.
- Implementing session and server selection, removing silent failover between
  independent server instances.
- Developing message polling, local chat and message reads, and the initial
  chat screens.
- Proposing an outbox and text composer for issue #38, including automatic
  retry and tests. This work is still subject to integration and verification.

The team also made changes independently, including UI improvements, temporary
server selection and web hosting configuration. AI output was reviewed and
iterated on with human feedback; it was not accepted automatically.

## Key decisions and limitations

- The initial database stores data supported by the API. E2EE, shared events
  and forum-like chats are deferred.
- Web SQLite depends on browser capabilities and hosting configuration. A
  memory-only fallback is available when persistent storage cannot be opened.
- Web `localStorage` is an insecure interim location for tokens. The local
  database is not encrypted.
- The server does not return a message ID when sending or support a client
  idempotency key. Retrying an uncertain send can therefore create duplicates.
- The outbox sends rows per chat in enqueue order, blocking later rows in that
  chat until earlier rows succeed or become retryable; duplicate risk is unchanged.
- Sending is claimed atomically: `markSending` accepts both pending and failed rows,
  returns whether it transitioned a row, and prevents discarded or already-sending
  rows from being posted.
- A timeout on `postmessage` can abort a request after the server has already stored it, so an automatic retry may create a duplicate; the default timeout is slightly larger for binary requests but the accepted duplicate risk remains unchanged.
- Public-chat browsing and joining is a separate planned feature that can later
  be reused for laboratory groups; it does not itself implement their
  course-to-subgroup relationship.
- Invitations and public-chat browsing are local reads of the account's chat
  snapshot. The selectors only show invited rows or unjoined public,
  non-direct chats, and accept, reject and join remain network actions in
  `ChatActions`; each action refreshes the local chat snapshot afterward.
- Chat creation and invitations use `ChatActions` on the messaging runtime.
  `refreshChats()` waits for an active sync cycle and then refreshes only the
  chat snapshot; refresh failures do not undo a successful server creation.
  Direct-chat names are display names only: the server receives the combined
  name, while the local UI resolves the other participant from chat members and
  profiles and keeps the chat name unchanged.

## Verification and responsibility

AI-generated code and recommendations require human review and testing. Some
steps were checked with automated tests, typechecking and linting; reports from
chatbots without repository access were proposals and could not independently
verify their code. Web storage was tested manually in the browser, while native
testing and login under the deployed COOP/COEP configuration remain open.

The team owns the resulting implementation, acceptance criteria and remaining
technical decisions.
