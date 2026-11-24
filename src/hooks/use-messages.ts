import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { RawMessage } from "../storage/types";

const DEFAULT_PAGE_SIZE = 30;
const STORAGE_RETRY_MS = 200;

export function useTaggedMessages(chatId: number, ids: readonly number[] | null) {
  const [result, setResult] = useState<{
    ids: readonly number[];
    messages: RawMessage[];
    error: boolean;
  }>();

  useEffect(() => {
    if (ids === null) return;
    let cancelled = false;
    let request = 0;
    async function load(messageIds: readonly number[]) {
      const current = ++request;
      try {
        const storage = syncRuntime.getAccountStorage();
        if (storage === null) throw new Error("Account storage is unavailable");
        const rows = await Promise.all(messageIds.map((id) => storage.messages.get(chatId, id)));
        if (!cancelled && current === request) {
          setResult({ ids: messageIds, messages: rows.filter((row) => row !== null), error: false });
        }
      } catch {
        if (!cancelled && current === request) setResult({ ids: messageIds, messages: [], error: true });
      }
    }
    const refresh = () => { void load(ids); };
    refresh();
    const unsubscribe = storageEvents.subscribeMessages(chatId, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [chatId, ids]);

  return ids === result?.ids ? result : undefined;
}

export function useMessages(
  chatId: number,
  opts?: { pageSize?: number; targetId?: number | null },
): {
  messages: RawMessage[];
  loading: boolean;
  hasMore: boolean;
  loadOlder: () => Promise<void>;
} {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const targetId = opts?.targetId ?? null;
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadedTarget, setLoadedTarget] = useState<number | null>(null);
  const requestId = useRef(0);
  const loadedCountRef = useRef(pageSize);
  const pagination = useRef<symbol | null>(null);

  useEffect(() => {
    loadedCountRef.current = pageSize;
    pagination.current = null;
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
        // The target is the newest row of this window, so the inverted list lands on it
        // immediately even when it is far outside the regular first page.
        .listPage(chatId, { beforeId: targetId === null ? undefined : targetId + 1, limit: loadedCountRef.current })
        .then((rows) => {
          if (cancelled || id !== requestId.current) return;
          setMessages(rows);
          setLoadedTarget(targetId);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled || id !== requestId.current) return;
          if (targetId !== null) setMessages([]);
          setLoadedTarget(targetId);
          setLoading(false);
        });
    };

    load();
    const unsubscribe = storageEvents.subscribeMessages(chatId, load);
    return () => {
      cancelled = true;
      pagination.current = null;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [chatId, pageSize, targetId]);

  useEffect(() => {
    syncRuntime.setOpenChatId(chatId);
    // Refresh once on entering the chat. Selecting a local search hit keeps the same poller.
    void syncRuntime.pollNow(chatId);
    return () => syncRuntime.setOpenChatId(null);
  }, [chatId]);

  const loadOlder = async (): Promise<void> => {
    const storage = syncRuntime.getAccountStorage();
    if (storage === null || loadedTarget !== targetId || pagination.current !== null) return;
    const oldest = messages[messages.length - 1];
    if (oldest === undefined) return;
    const request = Symbol();
    pagination.current = request;
    try {
      const older = await storage.messages.listPage(chatId, { beforeId: oldest.id, limit: pageSize });
      if (pagination.current !== request) return;
      setHasMore(older.length === pageSize);
      if (older.length === 0) return;
      loadedCountRef.current += older.length;
      setMessages((current) => [...current, ...older]);
    } finally {
      if (pagination.current === request) pagination.current = null;
    }
  };

  return { messages, loading: loadedTarget !== targetId || loading, hasMore, loadOlder };
}
