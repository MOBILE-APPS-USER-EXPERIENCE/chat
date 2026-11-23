import type { ChatRow } from "../storage/types";

export function selectInvitations(chats: readonly ChatRow[]): ChatRow[] {
  return chats.filter(
    (chat) =>
      chat.role === "invited" &&
      !chat.joined &&
      chat.missingSince === null,
  );
}

export function selectBrowsableChats(chats: readonly ChatRow[]): ChatRow[] {
  return chats.filter(
    (chat) =>
      chat.visibility === "public" &&
      !chat.joined &&
      chat.role !== "invited" &&
      !chat.directchat &&
      chat.id !== 0 &&
      chat.missingSince === null,
  );
}

export function filterChatsByName(
  chats: readonly ChatRow[],
  query: string,
): ChatRow[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...chats];
  return chats.filter((chat) => chat.name.toLowerCase().includes(needle));
}
