import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { RawMessage } from "../storage/types";
import { keepIfEqual } from "../utils/keep-if-equal";

const STORAGE_RETRY_MS = 200;

export function useChatPreviews(): {
  latestByChat: Record<number, RawMessage>;
  loading: boolean;
} {
  const [latestByChat, setLatestByChat] = useState<Record<number, RawMessage>>({});
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) {
          setLatestByChat({});
          setLoading(true);
          retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        }
        return;
      }
      const id = ++requestId.current;
      void storage.messages
        .listLatestPerChat()
        .then((rows) => {
          if (cancelled || id !== requestId.current) return;
          const next: Record<number, RawMessage> = {};
          for (const message of rows) next[message.chatId] = message;
          setLatestByChat((previous) => keepIfEqual(previous, next));
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled && id === requestId.current) setLoading(false);
        });
    };

    load();
    const unsubscribeMessages = storageEvents.subscribeAnyMessages(load);
    const unsubscribeChats = storageEvents.subscribeChats(load);
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribeMessages();
      unsubscribeChats();
    };
  }, []);

  return { latestByChat, loading };
}
