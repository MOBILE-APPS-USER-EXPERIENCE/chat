/** @jest-environment node */
import { createForegroundSignal } from "./foregroundSignal.web";

// Minimal stand-in for the `document` surface foregroundSignal.web uses. The react-native preset
// setup defines a non-configurable `window` global for every test file, which collides with the
// jsdom environment ("Cannot redefine property: window"), so this file stays in the default node
// environment instead of loading a full DOM.
class FakeDocument {
  hidden = false;
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener);
  }

  dispatchEvent(_event: { type: string }): boolean {
    for (const listener of [...this.listeners]) listener();
    return true;
  }
}

const fakeDocument = new FakeDocument();

// The DOM lib types the global `document` as `Document`; the fake only implements the surface
// foregroundSignal.web relies on, hence the cast.
(globalThis as { document: unknown }).document = fakeDocument;
describe("createForegroundSignal (web)", () => {
  afterEach(() => {
    fakeDocument.hidden = false;
  });

  test("isForeground reflects !document.hidden", () => {
    const signal = createForegroundSignal();
    expect(signal.isForeground()).toBe(true);
    fakeDocument.hidden = true;
    expect(signal.isForeground()).toBe(false);
  });

  test("subscribe notifies on visibilitychange, and stops after unsubscribe", () => {
    const signal = createForegroundSignal();
    const listener = jest.fn();
    const unsubscribe = signal.subscribe(listener);
    fakeDocument.dispatchEvent({ type: "visibilitychange" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    fakeDocument.dispatchEvent({ type: "visibilitychange" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
