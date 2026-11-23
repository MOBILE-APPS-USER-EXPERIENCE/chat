import { ApiError, NetworkError } from "@/api/apiClient";

import { describeAuthError } from "./auth-error";
import type { ChatRow, ProfileRow } from "@/storage/types";

export type InviteeResolution =
  | { type: "profile"; profile: ProfileRow }
  | { type: "hash"; hash: string }
  | { type: "userid-not-found"; userid: string }
  | null;

export function resolveInvitee(
  input: string,
  profiles: ProfileRow[],
  selfUserid: string,
): InviteeResolution {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const self = selfUserid.toLowerCase();
  const needle = trimmed.toLowerCase();

  const matches = profiles.filter((profile) => {
    if (profile.userid.toLowerCase() === self || profile.missingSince !== null)
      return false;
    return (
      profile.userid.toLowerCase().includes(needle) ||
      (profile.nickname?.toLowerCase().includes(needle) ?? false) ||
      (profile.fullname?.toLowerCase().includes(needle) ?? false) ||
      profile.hash.toLowerCase().includes(needle)
    );
  });
  if (matches.length > 0) return { type: "profile", profile: matches[0] };

  if (/^[a-z]{4}it\d{2}$/i.test(trimmed)) {
    if (trimmed.toLowerCase() === self) return null;
    return { type: "userid-not-found", userid: trimmed };
  }
  if (/^[A-Za-z0-9]{8}$/.test(trimmed))
    return { type: "hash", hash: trimmed };
  return null;
}

export function findExistingDirectChat(
  input:
    | {
        chats: ChatRow[];
        membersByChat: Map<number, { userid: string }[]>;
        otherUserid: string;
      }
    | ChatRow[],
  maybeMembers?: Map<number, { userid: string }[]>,
  maybeOtherUserid?: string,
): ChatRow | null {
  let chats: ChatRow[];
  let membersByChat: Map<number, { userid: string }[]>;
  let otherUserid: string;
  if (Array.isArray(input)) {
    chats = input;
    membersByChat = maybeMembers ?? new Map();
    otherUserid = (maybeOtherUserid ?? "").toLowerCase();
  } else {
    chats = input.chats;
    membersByChat = input.membersByChat;
    otherUserid = input.otherUserid.toLowerCase();
  }
  return (
    chats.find(
      (chat) =>
        chat.directchat &&
        chat.joined &&
        (membersByChat
          .get(chat.id)
          ?.some(
            (member) =>
              member.userid.toLowerCase() === otherUserid,
          ) ??
          false),
    ) ?? null
  );
}

export function chatDisplayName(args: {
  chat: ChatRow;
  members: { userid: string }[];
  profiles: ProfileRow[];
  selfUserid: string;
}): string {
  if (!args.chat.directchat) return args.chat.name;
  const self = args.selfUserid.toLowerCase();
  const other = args.members.find(
    (member) => member.userid.toLowerCase() !== self,
  );
  if (!other) return args.chat.name;
  const profile = args.profiles.find(
    (row) => row.userid.toLowerCase() === other.userid.toLowerCase(),
  );
  return (
    profile?.nickname?.trim() ||
    profile?.fullname?.trim() ||
    other.userid
  );
}

export function describeChatActionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 462)
      return "Der Name ist zu kurz (mindestens 2 Zeichen).";
    if (error.code === 463)
      return "Dieser Einladungshash ist unbekannt.";
    if (error.code === 458)
      return "Einladung nicht möglich: Du bist nicht Besitzer, der Chat existiert nicht oder der Direktchat hat schon eine Einladung.";
  }
  if (error instanceof NetworkError)
    return "Der Server ist nicht erreichbar. Bitte prüfe deine Verbindung.";
  return describeAuthError(error, "Aktion konnte nicht ausgeführt werden.");
}
