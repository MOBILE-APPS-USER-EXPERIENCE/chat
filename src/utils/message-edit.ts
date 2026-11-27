import type { OutboxRow, RawMessage } from "../storage/types";

/*
 * Editing sent messages: client-side convention, see docs/adr/adr-006_message-edit-convention.md.
 *
 * The server cannot edit messages. An edit is an ordinary text message in the same chat:
 *
 *   [edit:<id of the original message>] <new text>
 *
 * This app hides edit messages and shows the newest text on the original. Other chat apps
 * show the edit as a normal message. Building and parsing the format happens only in this file.
 */

export const EDIT_PREFIX = "[edit:";
const EDIT_PATTERN = /^\[edit:(\d+)\] ([\s\S]*)$/;

export type ParsedEdit = { targetId: number; text: string };

/** Builds the text of an edit message for the original message `originalId`. */
export function buildEditText(originalId: number, text: string): string {
  return `${EDIT_PREFIX}${originalId}] ${text.trim()}`;
}

/** Reads an edit message, or returns null for normal text (and for edits with empty text). */
export function parseEditText(text: string | null | undefined): ParsedEdit | null {
  if (!text?.startsWith(EDIT_PREFIX)) return null;
  const match = EDIT_PATTERN.exec(text);
  if (!match) return null;
  const targetId = Number(match[1]);
  const newText = match[2].trim();
  if (!Number.isSafeInteger(targetId) || newText.length === 0) return null;
  return { targetId, text: newText };
}

/** True when the text uses the edit format, valid or not. Such messages are never shown as bubbles. */
export function isEditMessageText(text: string | null | undefined): boolean {
  return text?.startsWith(EDIT_PREFIX) ?? false;
}

function sameUser(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Hides edit messages and puts the newest valid edit text on each original.
 * An edit is valid when the original is in `messages`, has the same author and an older id.
 * Invalid edits (other author, unknown original) are hidden as well.
 */
export function applyMessageEdits(messages: readonly RawMessage[]): {
  messages: RawMessage[];
  editedIds: Set<number>;
} {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const latestEdit = new Map<number, RawMessage & { editText: string }>();

  for (const message of messages) {
    const edit = parseEditText(message.text);
    if (edit === null) continue;
    const original = byId.get(edit.targetId);
    if (
      original === undefined ||
      isEditMessageText(original.text) ||
      !sameUser(original.userid, message.userid) ||
      message.id <= original.id
    ) {
      continue;
    }
    const current = latestEdit.get(original.id);
    if (current === undefined || message.id > current.id) {
      latestEdit.set(original.id, { ...message, editText: edit.text });
    }
  }

  const visible: RawMessage[] = [];
  for (const message of messages) {
    if (isEditMessageText(message.text)) continue;
    const edit = latestEdit.get(message.id);
    visible.push(edit ? { ...message, text: edit.editText } : message);
  }
  return { messages: visible, editedIds: new Set(latestEdit.keys()) };
}

/**
 * Edits that are still in the outbox, newest per original message.
 * Used to show "wird gespeichert…" / "fehlgeschlagen" on the original instead of a pending bubble.
 */
export function pendingEditsByTarget(rows: readonly OutboxRow[]): Map<number, OutboxRow & { editText: string }> {
  const result = new Map<number, OutboxRow & { editText: string }>();
  for (const row of rows) {
    const edit = parseEditText(row.text);
    if (edit === null) continue;
    const current = result.get(edit.targetId);
    if (current === undefined || row.createdAt >= current.createdAt) {
      result.set(edit.targetId, { ...row, editText: edit.text });
    }
  }
  return result;
}

/** Only own text messages can be edited; photos, files and edit messages cannot. */
export function canEditMessage(
  message: Pick<RawMessage, "userid" | "text" | "photoId" | "fileId">,
  selfUserid: string,
): boolean {
  return (
    sameUser(message.userid, selfUserid) &&
    (message.text?.trim().length ?? 0) > 0 &&
    !message.photoId &&
    !message.fileId &&
    !isEditMessageText(message.text)
  );
}

/** Saving is only allowed when the new text is not empty and differs from the old one. */
export function isEditChange(oldText: string, newText: string): boolean {
  const next = newText.trim();
  return next.length > 0 && next !== oldText.trim();
}

/** Text for previews: the new text of an edit message, otherwise the text unchanged. */
export function displayText(text: string | null): string | null {
  return parseEditText(text)?.text ?? text;
}
