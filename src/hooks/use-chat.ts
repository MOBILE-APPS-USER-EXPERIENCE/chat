import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { ChatRow } from "../storage/types";

const STORAGE_RETRY_MS = 200;

export function useChat(chatId: number): {
  chat: ChatRow | null;
  loading: boolean;
} {
  const [chat, setChat] = useState<ChatRow | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) {
          setChat(null);
          setLoading(true);
          retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        }
        return;
      }
      const id = ++requestId.current;
      void storage.chats
        .get(chatId)
        .then((row) => {
          if (cancelled || id !== requestId.current) return;
          setChat(row);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled && id === requestId.current) setLoading(false);
        });
    };

    load();
    const unsubscribe = storageEvents.subscribeChats(load);
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [chatId]);

  return { chat, loading };
}
