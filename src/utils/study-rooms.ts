import type { ChatRow } from "../storage/types";
import type { StudyModule } from "./learning-status";
import {
  isSameProgress,
  parseStudyRoomName,
  studyRoomTitle,
  type StudyRoomInfo,
} from "./study-room-name";

export type StudyRoom = {
  chat: ChatRow;
  info: StudyRoomInfo;
  title: string;
  sameProgress: boolean;
};

/**
 * Public study rooms for one module, rooms with the same progress first, then newest first.
 * Joined rooms are kept (shown with "Öffnen"); direct chats, the main chat and chats that
 * disappeared from the server are left out.
 */
export function selectStudyRooms(
  chats: readonly ChatRow[],
  module: StudyModule,
  myProgress: string,
): StudyRoom[] {
  const rooms: StudyRoom[] = [];
  for (const chat of chats) {
    if (
      chat.visibility !== "public" ||
      chat.directchat ||
      chat.id === 0 ||
      chat.missingSince !== null
    ) {
      continue;
    }
    const info = parseStudyRoomName(chat.name);
    if (info === null || info.module !== module) continue;
    rooms.push({
      chat,
      info,
      title: studyRoomTitle(info),
      sameProgress: isSameProgress(info.progress, myProgress),
    });
  }
  return rooms.sort((a, b) => {
    if (a.sameProgress !== b.sameProgress) return a.sameProgress ? -1 : 1;
    return b.chat.id - a.chat.id;
  });
}
