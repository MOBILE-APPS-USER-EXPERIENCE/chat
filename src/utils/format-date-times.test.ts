/** @jest-environment node */
import { formatClock } from "./format-date-times";

describe("formatClock", () => {
  it("pads hours and minutes using local getters", () => {
    expect(formatClock(new Date(2026, 0, 2, 3, 4).getTime())).toBe("03:04");
    expect(formatClock(new Date(2026, 0, 2, 23, 59).getTime())).toBe("23:59");
  });
});
