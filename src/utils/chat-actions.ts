import { ApiError, NetworkError } from "@/api/apiClient";
import { ChatActionRejectedError } from "@/messaging/errors";

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
  excludeUserids: string[] = [],
): { matches: ProfileRow[]; resolution: InviteeResolution } {
  const trimmed = input.trim();
  const self = selfUserid.toLowerCase();
  const needle = trimmed.toLowerCase();
  const excluded = new Set(excludeUserids.map((userid) => userid.toLowerCase()));

  const eligible = profiles.filter(
    (profile) =>
      profile.userid.toLowerCase() !== self &&
      profile.missingSince === null &&
      !excluded.has(profile.userid.toLowerCase()),
  );

  if (trimmed.length === 0)
    return { matches: eligible, resolution: null };

  const anyExactHashProfile = profiles.find((profile) => profile.hash === trimmed);
  const exactHashProfile = eligible.find(
    (profile) => profile.hash === trimmed,
  );
  if (exactHashProfile)
    return {
      matches: [exactHashProfile],
      resolution: { type: "profile", profile: exactHashProfile },
    };
  if (anyExactHashProfile)
    return { matches: [], resolution: null };

  const matches = eligible.filter((profile) =>
    profile.userid.toLowerCase().includes(needle) ||
    (profile.nickname?.toLowerCase().includes(needle) ?? false) ||
    (profile.fullname?.toLowerCase().includes(needle) ?? false),
  );
  if (matches.length > 0)
    return {
      matches,
      resolution: { type: "profile", profile: matches[0] },
    };

  if (/^[a-z]{4}it\d{2}$/i.test(trimmed)) {
    if (trimmed.toLowerCase() === self)
      return { matches: [], resolution: null };
    if (excluded.has(trimmed.toLowerCase()))
      return { matches: [], resolution: null };
    return {
      matches: [],
      resolution: { type: "userid-not-found", userid: trimmed },
    };
  }
  if (/^[A-Za-z0-9]{8}$/.test(trimmed))
    return { matches: [], resolution: { type: "hash", hash: trimmed } };
  return { matches: [], resolution: null };
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

export function describeChatActionError(
  error: unknown,
  context: "create" | "invite" | "join" | "reject" = "invite",
): string {
  if (error instanceof ApiError) {
    if (error.code === 462)
      return "Der Name ist zu kurz (mindestens 2 Zeichen).";
    if (error.code === 463)
      return "Dieser Einladungshash ist unbekannt.";
    if (error.code === 458 && context === "join")
      return "Beitritt nicht möglich: Der Chat existiert nicht mehr oder ist privat.";
    if (error.code === 458 && context === "reject")
      return "Die Einladung existiert nicht mehr.";
    if (error.code === 458)
      return "Einladung nicht möglich: Du bist nicht Besitzer, der Chat existiert nicht oder der Direktchat hat schon eine Einladung.";
  }
  if (error instanceof ChatActionRejectedError) {
    if (context === "join")
      return "Beitritt nicht möglich: Der Chat existiert nicht mehr oder ist privat.";
    if (context === "reject")
      return "Die Einladung existiert nicht mehr.";
    if (context === "create" || context === "invite")
      return "Die Aktion ist nicht mehr möglich. Die Liste wurde aktualisiert.";
  }
  if (error instanceof NetworkError)
    return "Der Server ist nicht erreichbar. Bitte prüfe deine Verbindung.";
  return describeAuthError(error, "Aktion konnte nicht ausgeführt werden.");
}
