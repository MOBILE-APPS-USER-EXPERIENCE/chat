// The only file under src/messaging/runtime that imports src/session, src/storage and
// src/messaging/apiAdapter: this is the composition root. Importing it has no side effects
// beyond constructing these two objects; `_layout.tsx` calls `syncRuntime.start()` explicitly.
import { session } from "../../session";
import { accountStorage } from "../../storage/accountStorage";
import { createSyncApi, isNetworkError } from "../apiAdapter";
import { createForegroundSignal } from "./foregroundSignal";
import { StorageEvents } from "./storageEvents";
import { SyncScheduler } from "./syncScheduler";

export const storageEvents = new StorageEvents();

export const syncRuntime = new SyncScheduler({
  session,
  openAccountStorage: (accountId) => accountStorage.open(accountId),
  createSyncApi: () => createSyncApi(),
  foreground: createForegroundSignal(),
  events: storageEvents,
  now: Date.now,
  isNetworkError,
  onInvalidToken: () => {
    void session.logout();
  },
});

export { SyncScheduler } from "./syncScheduler";
export type {
  SyncRuntimeStatus,
  SyncRuntimeStatusValue,
} from "./syncScheduler";
