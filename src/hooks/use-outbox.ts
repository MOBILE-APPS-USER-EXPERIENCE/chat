import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { OutboxRow } from "../storage/types";

const STORAGE_RETRY_MS = 200;

export function useOutbox(chatId: number): {
  pending: OutboxRow[];
  sending: boolean;
  send: (text: string) => Promise<void>;
} {
  const [pending, setPending] = useState<OutboxRow[]>([]);
  const [sending, setSending] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) {
          setPending([]);
          retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        }
        return;
      }
      const id = ++requestId.current;
      void storage.outbox
        .listByChat(chatId)
        .then((rows) => {
          if (cancelled || id !== requestId.current) return; // a later request already won
          setPending(rows);
        })
        .catch(() => {
          // Keeps the previous list on a read error; the next event or retry tries again.
        });
    };

    load();
    const unsubscribe = storageEvents.subscribeOutbox(chatId, load);
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [chatId]);

  // `sending` wraps only the local enqueue call (validation + the outbox write), not the
  // network round trip: the row's own status ('sending'/'failed') already reflects that.
  const send = async (text: string): Promise<void> => {
    setSending(true);
    try {
      await syncRuntime.enqueueMessage(chatId, text);
    } finally {
      setSending(false);
    }
  };

  return { pending, sending, send };
}
