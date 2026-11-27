import { useMemo, useSyncExternalStore } from "react";

import { syncRuntime } from "../messaging/runtime";
import type { StudyModule } from "../utils/learning-status";
import { selectStudyRooms, type StudyRoom } from "../utils/study-rooms";
import { useChats } from "./use-chats";

function subscribeSyncStatus(listener: () => void): () => void {
  return syncRuntime.subscribeStatus(listener);
}

function getSyncStatus() {
  return syncRuntime.getStatus();
}

/**
 * Current background sync status. useSyncExternalStore subscribes a component to a store
 * outside React (here the sync scheduler) and re-renders it whenever the store reports a change.
 */
export function useSyncStatus(): { offline: boolean; storageError: boolean } {
  const { status } = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  return { offline: status === "offline", storageError: status === "storage_error" };
}

/**
 * Study rooms for one module, read from the local chat list (kept up to date by the
 * background sync, so it also works offline) plus the current sync status.
 */
export function useStudyRooms(
  module: StudyModule,
  myProgress: string,
): {
  rooms: StudyRoom[];
  loading: boolean;
  offline: boolean;
  storageError: boolean;
} {
  const { chats, loading } = useChats();
  const { offline, storageError } = useSyncStatus();
  const rooms = useMemo(
    () => selectStudyRooms(chats, module, myProgress),
    [chats, module, myProgress],
  );
  return {
    rooms,
    loading,
    offline,
    storageError,
  };
}
