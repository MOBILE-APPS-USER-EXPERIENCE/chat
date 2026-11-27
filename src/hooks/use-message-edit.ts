import { useCallback, useState } from "react";

import { syncRuntime } from "../messaging/runtime";
import { buildEditText, isEditChange } from "../utils/message-edit";

/** What is being edited: a sent message (edit message, ADR-006) or a row still in the outbox. */
export type EditTarget =
  | { kind: "sent"; id: number; text: string }
  | { kind: "pending"; clientMessageId: string; text: string };

/**
 * Edit mode for the chat composer.
 * - Sent message: queues an edit message `[edit:<id>] <text>` in the outbox. Sending, retries and
 *   offline behaviour are the existing outbox behaviour; the original bubble shows that state.
 * - Outbox row: changes its text in place, so only the final text is ever sent.
 */
export function useMessageEdit(chatId: number) {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const start = useCallback((next: EditTarget) => {
    setTarget(next);
    setError(undefined);
  }, []);

  const cancel = useCallback(() => {
    setTarget(null);
    setError(undefined);
  }, []);

  /** Saves the new text. Returns true when the edit is stored (locally queued or updated). */
  const save = useCallback(
    async (newText: string): Promise<boolean> => {
      if (target === null || !isEditChange(target.text, newText)) return false;
      setSaving(true);
      setError(undefined);
      try {
        if (target.kind === "sent") {
          await syncRuntime.enqueueMessage(chatId, buildEditText(target.id, newText));
        } else {
          const updated = await syncRuntime.updateOutboxText(
            target.clientMessageId,
            newText.trim(),
          );
          if (!updated) {
            throw new Error(
              "Die Nachricht wird gerade gesendet. Bearbeite sie, sobald sie angekommen ist.",
            );
          }
        }
        setTarget(null);
        return true;
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Speichern fehlgeschlagen.",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [chatId, target],
  );

  return { target, saving, error, start, cancel, save };
}
