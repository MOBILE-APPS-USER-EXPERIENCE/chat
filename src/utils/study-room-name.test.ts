/** @jest-environment node */

import {
  buildStudyRoomName,
  isSameProgress,
  parseExamNumber,
  parseStudyRoomName,
  stripStudyRoomPrefix,
  studyRoomInputError,
  studyRoomKind,
  studyRoomTitle,
} from "./study-room-name";

describe("buildStudyRoomName", () => {
  it("builds a name without exam number", () => {
    expect(buildStudyRoomName({ examNumber: null, module: "Mathe 2", progress: "Kapitel 3" }))
      .toBe("[Lernraum] Mathe 2 · Kapitel 3");
  });

  it("builds exam number, module and progress", () => {
    expect(buildStudyRoomName({ examNumber: 3, module: "AlgoDat", progress: " Blatt 6 " }))
      .toBe("[Lernraum] Musterprüfung 3 · AlgoDat · Blatt 6");
  });
});

describe("parseStudyRoomName", () => {
  it("reads exam number, module and progress", () => {
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 3 · AlgoDat · Blatt 6")).toEqual({
      examNumber: 3,
      module: "AlgoDat",
      progress: "Blatt 6",
    });
  });

  it("reads a name without exam number", () => {
    expect(parseStudyRoomName("[Lernraum] AlgoDat · Blatt 6 · Graphen")).toEqual({
      examNumber: null,
      module: "AlgoDat",
      progress: "Blatt 6 · Graphen",
    });
  });

  it("does not take an exam mention inside the progress as exam number", () => {
    expect(parseStudyRoomName("[Lernraum] AlgoDat · Musterprüfung 2")).toEqual({
      examNumber: null,
      module: "AlgoDat",
      progress: "Musterprüfung 2",
    });
  });

  it("keeps a separator inside the progress", () => {
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 1 · Mathe 2 · Kapitel 3 · Integrale")?.progress)
      .toBe("Kapitel 3 · Integrale");
  });

  it("round-trips every built name", () => {
    for (const examNumber of [12, null]) {
      const info = { examNumber, module: "Software-Eng." as const, progress: "Übung 4 · Joins" };
      expect(parseStudyRoomName(buildStudyRoomName(info))).toEqual(info);
    }
  });

  it("rejects names that are not study rooms", () => {
    expect(parseStudyRoomName("Main Chat")).toBeNull();
    expect(parseStudyRoomName("WS26:MOD:Mathe_1:MAIN")).toBeNull();
    expect(parseStudyRoomName("[Lernraum]")).toBeNull();
    expect(parseStudyRoomName("[Lernraum] Dijkstra · AlgoDat · Blatt 6")).toBeNull();
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 3 · Physik · Blatt 6")).toBeNull();
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 3 · AlgoDat")).toBeNull();
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 0 · AlgoDat · Blatt 6")).toBeNull();
    expect(parseStudyRoomName("[Lernraum] Musterprüfung 100 · AlgoDat · Blatt 6")).toBeNull();
  });
});

describe("form validation", () => {
  it("accepts whole numbers from 1 to 99", () => {
    expect(parseExamNumber(" 3 ")).toBe(3);
    expect(parseExamNumber("99")).toBe(99);
    expect(parseExamNumber("0")).toBeNull();
    expect(parseExamNumber("100")).toBeNull();
    expect(parseExamNumber("2.5")).toBeNull();
    expect(parseExamNumber("")).toBeNull();
  });

  it("allows an empty number and explains an invalid one", () => {
    expect(studyRoomInputError({ examNumber: " ", module: "AlgoDat", progress: "Blatt 6" })).toBeNull();
    expect(studyRoomInputError({ examNumber: "3", module: "AlgoDat", progress: "Blatt 6" })).toBeNull();
    expect(studyRoomInputError({ examNumber: "0", module: "AlgoDat", progress: "Blatt 6" }))
      .toBe("Bitte eine Nummer von 1 bis 99 eingeben oder das Feld leer lassen.");
  });

  it("rejects names that would be too long for the server", () => {
    expect(studyRoomInputError({ examNumber: "99", module: "Mediengestaltung", progress: "x".repeat(60) }))
      .toBe("Dein Stand ist zu lang für einen Raumnamen. Kürze ihn im Lernstatus.");
  });
});

describe("display helpers", () => {
  it("strips the prefix only from study room names", () => {
    expect(stripStudyRoomPrefix("[Lernraum] Musterprüfung 3 · AlgoDat · Blatt 6"))
      .toBe("Musterprüfung 3 · AlgoDat · Blatt 6");
    expect(stripStudyRoomPrefix("[Lernraum] kein Raum")).toBe("[Lernraum] kein Raum");
    expect(stripStudyRoomPrefix("Main Chat")).toBe("Main Chat");
  });

  it("uses the exam number as title, or a generic title", () => {
    expect(studyRoomTitle({ examNumber: 3, module: "AlgoDat", progress: "Blatt 6" })).toBe("Musterprüfung 3");
    expect(studyRoomTitle({ examNumber: null, module: "AlgoDat", progress: "Blatt 6" })).toBe("Lernraum");
  });

  it("labels exam rooms, general rooms and other chats", () => {
    expect(studyRoomKind("[Lernraum] Musterprüfung 3 · AlgoDat · Blatt 6")).toBe("Prüfungsvorbereitung");
    expect(studyRoomKind("[Lernraum] AlgoDat · Blatt 6")).toBe("Lernraum");
    expect(studyRoomKind("Main Chat")).toBeNull();
  });

  it("compares progress ignoring case and surrounding spaces", () => {
    expect(isSameProgress(" Blatt 6 ", "blatt 6")).toBe(true);
    expect(isSameProgress("Blatt 6", "Blatt 7")).toBe(false);
  });
});
