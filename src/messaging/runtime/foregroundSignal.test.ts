/** @jest-environment node */

import { AppState } from "react-native";
import { createForegroundSignal } from "./foregroundSignal";

// babel-plugin-jest-hoist forbids variable access inside jest.mock factories except in type
// positions; the `state` parameter name of an inline function type counts as a variable access,
// so the listener type lives in this alias (type references are erased at runtime).
type MockListener = (state: string) => void;

jest.mock("react-native", () => {
  const listeners = new Set<MockListener>();
  const appState = {
    currentState: "active",
    addEventListener: (_event: string, handler: MockListener) => {
      listeners.add(handler);
      return { remove: () => listeners.delete(handler) };
    },
    __emit(next: string): void {
      appState.currentState = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
  return { AppState: appState };
});

type MockAppState = typeof AppState & { __emit: (state: string) => void };
const mockAppState = AppState as MockAppState;

describe("createForegroundSignal (native)", () => {
  beforeEach(() => {
    mockAppState.__emit("active");
  });

  test('isForeground reflects AppState.currentState === "active"', () => {
    const signal = createForegroundSignal();
    expect(signal.isForeground()).toBe(true);
    mockAppState.__emit("background");
    expect(signal.isForeground()).toBe(false);
  });

  test("subscribe notifies on every AppState change, and stops after unsubscribe", () => {
    const signal = createForegroundSignal();
    const listener = jest.fn();
    const unsubscribe = signal.subscribe(listener);
    mockAppState.__emit("background");
    mockAppState.__emit("active");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    mockAppState.__emit("background");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
