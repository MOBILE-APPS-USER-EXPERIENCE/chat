import { isStudyModule, type StudyModule } from "./learning-status";

/*
 * Naming convention for study rooms ("Lernräume").
 *
 * A study room is an ordinary PUBLIC group chat. The server has no field for module or
 * progress (docs/openapi.yaml: a chat only has `chatname`), so everything is encoded in the name:
 *
 *   [Lernraum] Musterprüfung <Nr> · <Modul> · <Stand>   (Musterprüfung optional)
 *   [Lernraum] Musterprüfung 3 · AlgoDat · Blatt 6
 *   [Lernraum] Mathe 2 · Kapitel 3 · Integrale             (no exam; the Stand may contain " · ")
 *
 * This is a CLIENT-SIDE CONVENTION, not a rule the server enforces: anyone can create a chat
 * with any name. Everything that defines the format lives in this file, so switching to
 * another scheme later (e.g. the team's "WS26:MOD:…" names) only touches this file.
 */

export const STUDY_ROOM_PREFIX = "[Lernraum]";
export const STUDY_ROOM_SEPARATOR = " · ";
export const EXAM_LABEL = "Musterprüfung";
export const MAX_EXAM_NUMBER = 99;

/**
 * Longest chat name the server stores unchanged.
 * TODO: Provisional value. Confirm with the length test against the real server
 * (docs/openapi.yaml does not specify a maximum, only a minimum of 2 characters).
 */
export const MAX_CHAT_NAME_LENGTH = 100;

export type StudyRoomInfo = {
  /** Number of the sample exam ("Musterprüfung"), or null when the room has none. */
  examNumber: number | null;
  module: StudyModule;
  progress: string;
};

const EXAM_PART = new RegExp(`^${EXAM_LABEL} (\\d{1,2})$`);

/** Parses the number typed into the form, or null when it is not a whole number from 1 to 99. */
export function parseExamNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_EXAM_NUMBER ? value : null;
}

/** Builds the chat name. */
export function buildStudyRoomName(info: StudyRoomInfo): string {
  const parts = [info.module, info.progress.trim()];
  if (info.examNumber !== null) parts.unshift(`${EXAM_LABEL} ${info.examNumber}`);
  return `${STUDY_ROOM_PREFIX} ${parts.join(STUDY_ROOM_SEPARATOR)}`;
}

/** German validation message for the form, or null when a room can be created. */
export function studyRoomInputError(input: {
  examNumber: string;
  module: StudyModule;
  progress: string;
}): string | null {
  const empty = input.examNumber.trim().length === 0;
  const examNumber = empty ? null : parseExamNumber(input.examNumber);
  if (!empty && examNumber === null) {
    return `Bitte eine Nummer von 1 bis ${MAX_EXAM_NUMBER} eingeben oder das Feld leer lassen.`;
  }
  const name = buildStudyRoomName({ examNumber, module: input.module, progress: input.progress });
  if (name.length > MAX_CHAT_NAME_LENGTH) {
    return "Dein Stand ist zu lang für einen Raumnamen. Kürze ihn im Lernstatus.";
  }
  return null;
}

/** Reads exam number, module and progress from a chat name, or null when it is not a study room. */
export function parseStudyRoomName(name: string): StudyRoomInfo | null {
  if (!name.startsWith(`${STUDY_ROOM_PREFIX} `)) return null;
  const parts = name
    .slice(STUDY_ROOM_PREFIX.length)
    .trim()
    .split(STUDY_ROOM_SEPARATOR);
  // The exam part is optional; when present it comes first and is followed by the module.
  const examMatch = EXAM_PART.exec(parts[0]?.trim() ?? "");
  let examNumber: number | null = null;
  if (examMatch) {
    examNumber = parseExamNumber(examMatch[1]);
    if (examNumber === null) return null;
    parts.shift();
  }
  const [modulePart, ...progressParts] = parts;
  const studyModule = modulePart?.trim();
  const progress = progressParts.join(STUDY_ROOM_SEPARATOR).trim();
  if (!isStudyModule(studyModule) || progress.length === 0) return null;
  return { examNumber, module: studyModule, progress };
}

/** The chat name without the prefix, e.g. for chat titles. Other names are returned unchanged. */
export function stripStudyRoomPrefix(name: string): string {
  return parseStudyRoomName(name) === null
    ? name
    : name.slice(STUDY_ROOM_PREFIX.length).trim();
}

/** Short room title for lists: "Musterprüfung 3", or "Lernraum" when the room has no exam. */
export function studyRoomTitle(info: StudyRoomInfo): string {
  return info.examNumber === null ? "Lernraum" : `${EXAM_LABEL} ${info.examNumber}`;
}

export type StudyRoomKind = "Prüfungsvorbereitung" | "Lernraum";

/** Label for chat lists: rooms with a sample exam vs. general study rooms; null for other chats. */
export function studyRoomKind(name: string): StudyRoomKind | null {
  const info = parseStudyRoomName(name);
  if (info === null) return null;
  return info.examNumber === null ? "Lernraum" : "Prüfungsvorbereitung";
}

/** Compares two progress texts ignoring case and surrounding whitespace. */
export function isSameProgress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
