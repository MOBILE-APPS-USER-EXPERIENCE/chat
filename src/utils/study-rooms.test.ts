/** @jest-environment node */

import type { ChatRow } from "../storage/types";
import { selectStudyRooms } from "./study-rooms";

function chat(patch: Partial<ChatRow> = {}): ChatRow {
  return {
    id: 1,
    name: "[Lernraum] Musterprüfung 1 · AlgoDat · Blatt 6",
    visibility: "public",
    directchat: false,
    role: "none",
    joined: false,
    ownerUserid: "owner",
    firstSeenAt: 1,
    missingSince: null,
    syncedAt: 1,
    polledUpTo: 0,
    lastPolledAt: null,
    ...patch,
  };
}

describe("selectStudyRooms", () => {
  it("keeps only public study rooms of my module", () => {
    const rooms = selectStudyRooms(
      [
        chat({ id: 1 }),
        chat({ id: 2, name: "[Lernraum] Musterprüfung 1 · Datenbanken · Blatt 6" }),
        chat({ id: 3, name: "AlgoDat Lerngruppe" }),
        chat({ id: 4, visibility: "private" }),
        chat({ id: 5, directchat: true }),
        chat({ id: 6, missingSince: 10 }),
        chat({ id: 0 }),
      ],
      "AlgoDat",
      "Blatt 6",
    );
    expect(rooms.map((room) => room.chat.id)).toEqual([1]);
  });

  it("keeps joined rooms so they can be opened", () => {
    const rooms = selectStudyRooms([chat({ joined: true, role: "member" })], "AlgoDat", "x");
    expect(rooms[0].chat.joined).toBe(true);
  });

  it("puts rooms with the same progress first, then newest first", () => {
    const rooms = selectStudyRooms(
      [
        chat({ id: 1, name: "[Lernraum] Musterprüfung 1 · AlgoDat · Blatt 5" }),
        chat({ id: 2, name: "[Lernraum] Musterprüfung 2 · AlgoDat ·  blatt 6 " }),
        chat({ id: 3, name: "[Lernraum] Musterprüfung 1 · AlgoDat · Blatt 7" }),
        chat({ id: 4, name: "[Lernraum] Musterprüfung 3 · AlgoDat · BLATT 6" }),
      ],
      "AlgoDat",
      " Blatt 6",
    );
    expect(rooms.map((room) => [room.chat.id, room.sameProgress])).toEqual([
      [4, true],
      [2, true],
      [3, false],
      [1, false],
    ]);
    expect(rooms[0].title).toBe("Musterprüfung 3");
  });
});
