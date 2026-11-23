/** @jest-environment node */

import { JsonKeyValueStore } from "../storage/kv/jsonKeyValueStore";
import { MemoryStringBackend } from "../storage/memory";
import {
  isProgressMissing,
  learningStatusKey,
  MAX_PROGRESS_LENGTH,
  parseLearningStatus,
  readLearningStatus,
  studyProgramLabel,
  toLearningStatus,
  writeLearningStatus,
} from "./learning-status";

describe("learning status validation", () => {
  it("treats empty and whitespace-only progress as missing", () => {
    expect(isProgressMissing("")).toBe(true);
    expect(isProgressMissing("   ")).toBe(true);
    expect(isProgressMissing("Kapitel 3")).toBe(false);
  });

  it("returns null while any field is missing", () => {
    expect(toLearningStatus({ studyProgram: null, module: "AlgoDat", progress: "x" })).toBeNull();
    expect(toLearningStatus({ studyProgram: "SWB", module: null, progress: "x" })).toBeNull();
    expect(toLearningStatus({ studyProgram: "SWB", module: "AlgoDat", progress: "  " })).toBeNull();
  });

  it("trims the progress text", () => {
    expect(
      toLearningStatus({ studyProgram: "TIB", module: "Mathe 2", progress: "  Kapitel 3 " }),
    ).toEqual({ studyProgram: "TIB", module: "Mathe 2", progress: "Kapitel 3" });
  });

  it("accepts exactly the maximum length and rejects longer text", () => {
    const max = "a".repeat(MAX_PROGRESS_LENGTH);
    expect(toLearningStatus({ studyProgram: "WKB", module: "Datenbanken", progress: max })?.progress).toBe(max);
    expect(toLearningStatus({ studyProgram: "WKB", module: "Datenbanken", progress: `${max}a` })).toBeNull();
  });

  it("returns the full study program label", () => {
    expect(studyProgramLabel("SWB")).toBe("SWB · Softwaretechnik und Medieninformatik");
  });
});

describe("parseLearningStatus", () => {
  it("accepts a valid stored status", () => {
    const status = { studyProgram: "SWB", module: "Software-Eng.", progress: "Übungsblatt 2" };
    expect(parseLearningStatus(status)).toEqual(status);
  });

  it("rejects unknown options and wrong shapes", () => {
    expect(parseLearningStatus(null)).toBeNull();
    expect(parseLearningStatus("SWB")).toBeNull();
    expect(parseLearningStatus({ studyProgram: "XYZ", module: "AlgoDat", progress: "x" })).toBeNull();
    expect(parseLearningStatus({ studyProgram: "SWB", module: "Physik", progress: "x" })).toBeNull();
    expect(parseLearningStatus({ studyProgram: "SWB", module: "AlgoDat", progress: 3 })).toBeNull();
  });
});

describe("learning status storage", () => {
  it("returns null when nothing is stored", async () => {
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    expect(await readLearningStatus(kv, "acc-1")).toBeNull();
  });

  it("stores the status per account", async () => {
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    const status = { studyProgram: "TIB", module: "AlgoDat", progress: "Kapitel 1" } as const;
    await writeLearningStatus(kv, "acc-1", status);
    expect(await readLearningStatus(kv, "acc-1")).toEqual(status);
    expect(await readLearningStatus(kv, "acc-2")).toBeNull();
  });

  it("treats a stored value with an invalid shape as no status", async () => {
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    await kv.setJson(learningStatusKey("acc-1"), { studyProgram: "nope" });
    expect(await readLearningStatus(kv, "acc-1")).toBeNull();
  });
});
