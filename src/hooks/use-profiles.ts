import { useEffect, useRef, useState } from "react";

import { storageEvents, syncRuntime } from "../messaging/runtime";
import type { ProfileRow } from "../storage/types";

const STORAGE_RETRY_MS = 200;

export function useProfiles(): {
  profiles: ProfileRow[];
  loading: boolean;
} {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
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
      void storage.profiles
        .list()
        .then((rows) => {
          if (cancelled || id !== requestId.current) return;
          setProfiles(rows);
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
  }, []);

  return { profiles, loading };
}
