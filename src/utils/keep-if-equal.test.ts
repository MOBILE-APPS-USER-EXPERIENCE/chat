/** @jest-environment node */

import { keepIfEqual } from "./keep-if-equal";

describe("keepIfEqual", () => {
  it("returns the previous object when JSON data is equal", () => {
    const previous = { id: 1, name: "Chat" };
    expect(keepIfEqual(previous, { id: 1, name: "Chat" })).toBe(previous);
  });

  it("returns the next object when JSON data differs", () => {
    const previous = { id: 1, name: "Old" };
    const next = { id: 1, name: "New" };
    expect(keepIfEqual(previous, next)).toBe(next);
  });
});
