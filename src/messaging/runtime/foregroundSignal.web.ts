/**
 * Web counterpart of `foregroundSignal.ts`; see that file for why the interface is duplicated
 * instead of shared via import. `document`/`window` are only touched inside the functions below:
 * the static web export is evaluated in Node, where neither global exists at module load time.
 */
export interface ForegroundSignal {
  isForeground(): boolean;
  /** Notifies on every foreground/background transition. */
  subscribe(listener: () => void): () => void;
}

export function createForegroundSignal(): ForegroundSignal {
  return {
    isForeground: () =>
      typeof document === "undefined" ? true : !document.hidden,
    subscribe: (listener) => {
      if (typeof document === "undefined") {
        // No document in this environment (Node-evaluated static export): nothing to wire up.
        return () => {
          // Nothing was subscribed; nothing to undo.
        };
      }
      const handler = (): void => listener();
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
  };
}
