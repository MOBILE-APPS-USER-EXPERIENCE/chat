# ADR-006: Editing sent messages (client-side convention)

- Status: Proposed (needs team acceptance in the PR review)
- Related: AGENTS.md ("Features beyond the API", envelope format), ADR-005 (local database),
  `docs/openapi.yaml`, `src/utils/message-edit.ts`

## Context

Users want to fix a typo or add something to a message they already sent. The server cannot edit
messages: `docs/openapi.yaml` only has `postmessage` and `getmessages`, and a message has no field
for an edit or a reference to another message. AGENTS.md therefore treats editing as a
client-side convention and requires an ADR before any structured data ("envelope") is put into
the message `text`. This ADR is that decision for exactly one event type: an edit.

Facts from the spec and the code:

- `Message.id` is "unique within its chat and increases monotonically". Locally a message is
  identified by `chatId` + `id` (`RawMessage`).
- `Message.userid` is set by the server from the token, so a client cannot post as someone else.
- `text` is "sanitised" by the server; the spec does not say how. The format below only uses
  ASCII letters, digits, `[`, `]` and `:`; it is checked against the real server in the manual test.

## Decision

1. **Format.** An edit is an ordinary text message, sent with `postmessage` to the same chat:

   ```text
   [edit:<id>] <new text>
   ```

   `<id>` is the `id` of the original message in that chat. The prefix `[edit:` is defined once,
   as a constant in `src/utils/message-edit.ts`. Building and parsing live only in that file.
2. **Validity.** An edit is applied only if
   - the original message with that `id` exists in the same chat,
   - the edit has the **same `userid`** as the original (other edits are ignored and stay hidden),
   - the edit's own `id` is greater than the original's (it was sent later),
   - the new text is not empty.
3. **Latest wins.** With several valid edits of one message, the one with the highest `id` wins.
   An edit always points at the original message, never at another edit.
4. **Display in this app.**
   - Edit messages are never shown as their own bubble.
   - The original shows the latest text and a small "bearbeitet" next to the time.
   - The chat list preview shows the new text, not `[edit:…]`.
5. **Unsent messages** (still in the outbox) are not edited with an edit message. The outbox row's
   text is changed in place (`OutboxRepository.updateText`), so the server only ever sees the
   final text.
6. **Only own text messages** can be edited. Photos and files cannot.

## Honest limits (to be stated in UI/docs where relevant)

- **This is a convention, not a guarantee.** Other chat clients without this convention show
  `[edit:42] new text` as a normal message, and the original stays unchanged there.
- The original text is **not deleted** from the server. Everyone can still read it there.
- Messages are loaded page by page. An original appears only once its page is loaded; its edits
  are newer and therefore always loaded together with or before it.
- The message search (`use-message-search.ts`) still finds edit messages by their raw text,
  including `[edit:…]`. To be handled in a separate issue.
- An edit message that never reaches the server (e.g. the chat was deleted) stays in the outbox
  with the existing outbox error states.

## Alternatives considered

- **Edit only unsent outbox messages.** Honest, but useless online, where a message is sent within
  seconds. Kept as part of the decision (point 5), not as the only mechanism.
- **Human-readable correction ("✏️ Korrektur: …") without machine-readable reference.** Works in
  every client, but this app could not attach the new text to the original.
- **Local-only edit.** Rejected: the author would see different text than everyone else.
- **Server endpoint.** Not available; would be the clean solution if the server team adds one.

## Consequences

- Every new event type inside `text` (delete, reactions, …) needs its own ADR. This ADR does not
  define a general envelope format.
- If the team changes the format, only `src/utils/message-edit.ts` and this ADR change.
  Old edits in the old format would then show as normal messages.
