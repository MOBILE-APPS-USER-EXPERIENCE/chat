import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { RawMessage } from "../storage/types";

const DEFAULT_PAGE_SIZE = 30;
const STORAGE_RETRY_MS = 200;

export function useMessages(
  chatId: number,
  opts?: { pageSize?: number },
): {
  messages: RawMessage[];
  loading: boolean;
  hasMore: boolean;
  loadOlder: () => Promise<void>;
} {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const requestId = useRef(0);
  const loadedCountRef = useRef(pageSize);

  useEffect(() => {
    loadedCountRef.current = pageSize;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) {
          setMessages([]);
          setLoading(true);
          retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        }
        return;
      }
      const id = ++requestId.current;
      void storage.messages
        .listPage(chatId, { limit: loadedCountRef.current })
        .then((rows) => {
          if (cancelled || id !== requestId.current) return;
          setMessages(rows);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled && id === requestId.current) setLoading(false);
        });
    };

    load();
    const unsubscribe = storageEvents.subscribeMessages(chatId, load);
    syncRuntime.setOpenChatId(chatId);
    // Refreshes the chat immediately instead of waiting for the next scheduled cycle.
    void syncRuntime.pollNow(chatId);

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribe();
      // Chosen behavior: clear the open chat rather than restore a previous one (documented).
      syncRuntime.setOpenChatId(null);
    };
  }, [chatId, pageSize]);

  const loadOlder = async (): Promise<void> => {
    const storage = syncRuntime.getAccountStorage();
    if (storage === null || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    if (oldest === undefined) return;
    const older = await storage.messages.listPage(chatId, {
      beforeId: oldest.id,
      limit: pageSize,
    });
    setHasMore(older.length === pageSize);
    if (older.length === 0) return;
    loadedCountRef.current += older.length;
    setMessages((current) => [...current, ...older]);
  };

  return { messages, loading, hasMore, loadOlder };
}
