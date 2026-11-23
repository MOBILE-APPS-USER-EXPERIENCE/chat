import type { KeyValueStore } from "../storage/ports";

export const STUDY_PROGRAMS = [
  { value: "SWB", label: "SWB · Softwaretechnik und Medieninformatik" },
  { value: "TIB", label: "TIB · Technische Informatik" },
  { value: "WKB", label: "WKB · Wirtschaftsinformatik" },
] as const;

export const STUDY_MODULES = [
  { value: "AlgoDat", label: "AlgoDat" },
  { value: "Datenbanken", label: "Datenbanken" },
  { value: "Mediengestaltung", label: "Mediengestaltung" },
  { value: "Mathe 2", label: "Mathe 2" },
  { value: "Software-Eng.", label: "Software-Eng." },
] as const;

export const MAX_PROGRESS_LENGTH = 60;

export type StudyProgram = (typeof STUDY_PROGRAMS)[number]["value"];
export type StudyModule = (typeof STUDY_MODULES)[number]["value"];

/** A complete, valid learning status as it is stored on the device. */
export type LearningStatus = {
  studyProgram: StudyProgram;
  module: StudyModule;
  progress: string;
};

/** The form state, where every field may still be missing. */
export type LearningStatusDraft = {
  studyProgram: StudyProgram | null;
  module: StudyModule | null;
  progress: string;
};

/** Returns true when the progress text is empty or only whitespace. */
export function isProgressMissing(progress: string): boolean {
  return progress.trim().length === 0;
}

export function isStudyProgram(value: unknown): value is StudyProgram {
  return STUDY_PROGRAMS.some((option) => option.value === value);
}

export function isStudyModule(value: unknown): value is StudyModule {
  return STUDY_MODULES.some((option) => option.value === value);
}

/** Display label for a study program, e.g. "SWB · Softwaretechnik und Medieninformatik". */
export function studyProgramLabel(value: StudyProgram): string {
  return STUDY_PROGRAMS.find((option) => option.value === value)?.label ?? value;
}

/** Turns a form draft into a storable status (progress trimmed), or null when it is incomplete or too long. */
export function toLearningStatus(
  draft: LearningStatusDraft,
): LearningStatus | null {
  const progress = draft.progress.trim();
  if (draft.studyProgram === null || draft.module === null) return null;
  if (progress.length === 0 || progress.length > MAX_PROGRESS_LENGTH) {
    return null;
  }
  return { studyProgram: draft.studyProgram, module: draft.module, progress };
}

/** Validates a value read from storage; anything with an unexpected shape counts as "no status". */
export function parseLearningStatus(value: unknown): LearningStatus | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStudyProgram(candidate.studyProgram) ||
    !isStudyModule(candidate.module) ||
    typeof candidate.progress !== "string"
  ) {
    return null;
  }
  return toLearningStatus({
    studyProgram: candidate.studyProgram,
    module: candidate.module,
    progress: candidate.progress,
  });
}

/** One key per account, so several accounts on one device do not overwrite each other. */
export function learningStatusKey(accountId: string): string {
  return `learningStatus.${accountId}`;
}

// TODO: Replace local storage with the server endpoint for the learning status once it exists.
// The current API (docs/openapi.yaml) has no such endpoint, so the status stays on this device.
export async function readLearningStatus(
  kv: KeyValueStore,
  accountId: string,
): Promise<LearningStatus | null> {
  return parseLearningStatus(await kv.getJson<unknown>(learningStatusKey(accountId)));
}

export async function writeLearningStatus(
  kv: KeyValueStore,
  accountId: string,
  status: LearningStatus,
): Promise<void> {
  await kv.setJson(learningStatusKey(accountId), status);
}
