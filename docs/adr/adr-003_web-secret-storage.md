# ADR-003: Secret storage on web

- Status: Accepted
- Related: ADR-001 (AsyncStorage is not secure storage), `src/storage/secret/webSecretStore.ts`

## Context

Tokens and admin keys are secrets (`SecretStore`, keys `token.<accountId>` and
`adminKey.<accountId>`). On iOS and Android they are stored with `expo-secure-store`
(Keychain / Keystore). On web there is no equivalent. The interim `WebSecretStore` uses
`localStorage` under the prefix `chat.secret.`.

`localStorage` is readable by any script running on the origin. A single XSS bug exposes
every stored token and admin key. The backend is provided by the university and cannot
be changed, so server-side measures (for example httpOnly cookies) are not available.

## Options

**A - Keep `localStorage` (current state)**
No extra work and tokens survive restarts. Insecure; fine only for a course project.

**B - Password-derived vault**
Encrypt secrets with WebCrypto (for example PBKDF2 to derive a key, AES-GCM to encrypt)
and keep the derived key in memory only. The ciphertext may live in `localStorage` or
IndexedDB. An XSS attacker can no longer read stored data at rest, but can still use the
in-memory key while the page is open. The user must enter the password after every
reload, so "stay logged in" no longer works silently.

**C - Session only (`sessionStorage` or memory)**
Secrets vanish when the tab closes. This reduces exposure but has the same XSS weakness
while the tab is open, and the user logs in again on every visit.

**D - No persistent token on web**
Keep the token in memory and require login after each reload. Simplest and cleanest,
worst UX.

## Decision

Open. The team decides. Until then option A stays, and the file header of
`webSecretStore.ts` documents it as insecure.

## Consequences to weigh

- B and C change the UX: a password prompt or login after reload. This affects the
  startup flow in `src/app/_layout.tsx` and the auth screens (a later step).
- B needs a key-derivation design: salt storage, iteration count, behavior on password
  change, and what happens when the vault cannot be decrypted. All of it needs tests.
- The `SecretStore` port stays unchanged for A, C and D. B may need an `unlock(password)`
  step, which would change the port.
- Admin keys are typed in manually, so they could be session-only on web regardless of
  the choice for tokens.
- None of these options protects against a malicious browser extension or a compromised
  device.
