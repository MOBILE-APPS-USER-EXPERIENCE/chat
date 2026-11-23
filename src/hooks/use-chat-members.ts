import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";

const STORAGE_RETRY_MS = 200;

export function useChatMembers(
  chatId: number,
): { members: { userid: string; role: "owner" | "member" | "invited" }[] } {
  const [members, setMembers] = useState<
    { userid: string; role: "owner" | "member" | "invited" }[]
  >([]);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const load = (): void => {
      const storage = syncRuntime.getAccountStorage();
      if (storage === null) {
        if (!cancelled) retryTimer = setTimeout(load, STORAGE_RETRY_MS);
        return;
      }
      const id = ++requestId.current;
      void storage.chats
        .listMembers(chatId)
        .then((rows) => {
          if (cancelled || id !== requestId.current) return;
          setMembers(rows);
        })
        .catch(() => undefined);
    };
    load();
    const unsubscribe = storageEvents.subscribeChats(load);
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [chatId]);

  return { members };
}
