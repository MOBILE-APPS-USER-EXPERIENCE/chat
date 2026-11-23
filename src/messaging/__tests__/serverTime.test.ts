/** @jest-environment node */
import {
  parseServerTime,
  serverTimeToEpoch,
  type ServerTimeParts,
} from "../serverTime";

describe("parseServerTime", () => {
  it("parses valid wall-clock values", () => {
    expect(parseServerTime("2026-10-26_13-29-49")).toEqual({
      year: 2026,
      month: 10,
      day: 26,
      hour: 13,
      minute: 29,
      second: 49,
    } satisfies ServerTimeParts);
  });

  it.each([
    null,
    "",
    "2026-10-26T13:29:49",
    "2026-02-30_13-29-49",
    "2026-13-26_13-29-49",
    "2026-10-26_24-29-49",
    "2026-10-26_13-60-49",
    "2026-10-26_13-29-60",
  ])("rejects invalid value %p", (value) => {
    expect(parseServerTime(value)).toBeNull();
  });
});

describe("serverTimeToEpoch", () => {
  it("converts UTC wall time", () => {
    expect(serverTimeToEpoch("2026-10-26_13-29-49", "UTC")).toBe(
      Date.UTC(2026, 9, 26, 13, 29, 49),
    );
  });

  it("converts UTC+1 wall time", () => {
    expect(serverTimeToEpoch("2026-10-26_13-29-49", "UTC+1")).toBe(
      Date.UTC(2026, 9, 26, 12, 29, 49),
    );
  });

  it("converts Europe/Berlin winter to UTC+1", () => {
    expect(serverTimeToEpoch("2026-01-15_12-00-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 0, 15, 11, 0, 0),
    );
  });

  it("converts Europe/Berlin summer to UTC+2", () => {
    expect(serverTimeToEpoch("2026-07-15_12-00-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 6, 15, 10, 0, 0),
    );
  });

  it("uses DST starting at the exact 2026 spring UTC boundary", () => {
    expect(serverTimeToEpoch("2026-03-29_03-00-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 2, 29, 1, 0, 0),
    );
  });

  it("uses standard time at the exact 2026 autumn UTC boundary", () => {
    expect(serverTimeToEpoch("2026-10-25_02-00-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 9, 25, 1, 0, 0),
    );
  });

  it("takes the first DST occurrence for an ambiguous wall hour", () => {
    expect(serverTimeToEpoch("2026-10-25_02-30-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 9, 25, 0, 30, 0),
    );
  });

  it("uses standard time for a non-existent spring wall hour", () => {
    expect(serverTimeToEpoch("2026-03-29_02-30-00", "Europe/Berlin")).toBe(
      Date.UTC(2026, 2, 29, 1, 30, 0),
    );
  });

  it("returns null for unparseable time", () => {
    expect(serverTimeToEpoch(null, "Europe/Berlin")).toBeNull();
    expect(serverTimeToEpoch("bad", "UTC")).toBeNull();
  });
});
