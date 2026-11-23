import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { ChatRow } from "../storage/types";
import { keepIfEqual } from "../utils/keep-if-equal";

const STORAGE_RETRY_MS = 200;

export function useChats(filter?: { joined?: boolean }): {
  chats: ChatRow[];
  loading: boolean;
} {
  const joined = filter?.joined;
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) {
          setChats([]);
          setLoading(true);
          // Storage opens asynchronously right after sign-in; retry briefly until it is ready
          // instead of waiting indefinitely for a chats event that may never fire while offline.
          retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        }
        return;
      }
      const id = ++requestId.current;
      void storage.chats
        .list(joined === undefined ? undefined : { joined })
        .then((rows) => {
          if (cancelled || id !== requestId.current) return; // a later request already won
          setChats((previous) => keepIfEqual(previous, rows));
          setLoading(false);
        })
        .catch(() => {
          // Keeps the previous list on a read error; the next event or retry tries again.
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
  }, [joined]);

  return { chats, loading };
}
