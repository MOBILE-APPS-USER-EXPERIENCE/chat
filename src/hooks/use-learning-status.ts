import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useSession } from "../session";
import { keyValueStore } from "../storage";
import {
  readLearningStatus,
  writeLearningStatus,
  type LearningStatus,
} from "../utils/learning-status";

/**
 * Loads the learning status of the signed-in account from local storage.
 * It reloads every time the screen gains focus, so returning from
 * "Lernstatus setzen" shows the freshly saved values.
 */
export function useLearningStatus(): {
  status: LearningStatus | null;
  loading: boolean;
  error: string | undefined;
  save: (status: LearningStatus) => Promise<void>;
} {
  const sessionState = useSession();
  const accountId =
    sessionState.status === "signed_in" ? sessionState.account.id : null;
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      if (accountId === null) return;
      let cancelled = false;
      readLearningStatus(keyValueStore, accountId)
        .then((loaded) => {
          if (cancelled) return;
          setStatus(loaded);
          setError(undefined);
        })
        .catch((caughtError: unknown) => {
          if (cancelled) return;
          console.warn("Loading the learning status failed.", caughtError);
          setError("Lernstatus konnte nicht geladen werden.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [accountId]),
  );

  const save = useCallback(
    async (next: LearningStatus) => {
      if (accountId === null) throw new Error("Not signed in");
      await writeLearningStatus(keyValueStore, accountId, next);
      setStatus(next);
    },
    [accountId],
  );

  return { status, loading, error, save };
}
