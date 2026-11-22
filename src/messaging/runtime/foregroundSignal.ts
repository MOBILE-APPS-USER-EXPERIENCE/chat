import { AppState } from "react-native";

/**
 * Common interface, implemented once per platform (this native file and its `.web.ts` sibling).
 * The two files intentionally duplicate the interface declaration rather than one importing it
 * from the other: a `.web.ts` file importing its own base-name sibling (`./foregroundSignal`)
 * would resolve back to itself under Metro's platform extension order, which is fragile. Repeating
 * a four-line interface is cheaper than that risk.
 */
export interface ForegroundSignal {
  isForeground(): boolean;
  /** Notifies on every foreground/background transition. */
  subscribe(listener: () => void): () => void;
}

export function createForegroundSignal(): ForegroundSignal {
  return {
    isForeground: () => AppState.currentState === "active",
    subscribe: (listener) => {
      const subscription = AppState.addEventListener("change", () =>
        listener(),
      );
      return () => subscription.remove();
    },
  };
}
