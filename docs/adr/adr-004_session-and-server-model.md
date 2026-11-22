# ADR-004: Session and server model

- Status: Accepted
- Related: ADR-003 (web secret storage), `src/session/`, `src/storage/`

## Context

The app used to keep base URL, token and admin key in module state backed by AsyncStorage and
pinged the default server on start, silently switching to the backup server when it did not answer.
The default and the backup server are two separate instances with separate user databases, and a
token is only valid on the server that issued it. A silent switch therefore left the user with a
token the new server does not know, and plain AsyncStorage is not secure storage (ADR-001).

## Decision

- Servers are independent instances. There is no failover. The user selects a server explicitly;
  both defaults are seeded into the registry on first start.
- Every account belongs to exactly one server. The token (and optional admin key) is stored per
  account in the `SecretStore` (`token.<accountId>`, `adminKey.<accountId>`); the registry holds
  only non-secret data.
- `src/api/` is a stateless client: no storage imports, every call works on an `ApiContext`
  resolved once at the start of the call.
- `src/session/` sits on top: it owns servers, accounts, login/register/logout/deregister and
  restoring the session on app start. It publishes the active `ApiContext` to the client.
- Restoring a session makes no network calls. An invalid token surfaces on the first request (456).
- Logout works offline: the remote call is best effort with a timeout, so the server-side token
  may stay valid if the server was unreachable.
- A local account whose server user hash changed (deleted and re-registered user) is "stale":
  login fails with `StaleAccountError` and the local data must be discarded explicitly.

## Consequences

- Users must log in again after the update that introduced this model (legacy keys are removed).
- Switching servers requires logging out first.
- The UI needs a flow for stale accounts (discard local data); until then it only shows an error.
- Admin keys stay persisted per account, with the caveats of ADR-003.
