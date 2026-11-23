import type { ChatRow, RawMessage } from "../storage/types";
import { formatClock } from "./format-date-times";

export function chatActivityTime(chat: ChatRow, latest: RawMessage | undefined): number {
  if (!latest) return chat.firstSeenAt;
  return latest.sentAt ?? latest.receivedAt;
}

export function sortChatsByActivity(
  chats: readonly ChatRow[],
  latestByChat: Record<number, RawMessage>,
): ChatRow[] {
  return [...chats].sort((a, b) => {
    const activityDiff =
      chatActivityTime(b, latestByChat[b.id]) -
      chatActivityTime(a, latestByChat[a.id]);
    if (activityDiff !== 0) return activityDiff;
    return b.id - a.id;
  });
}

export function previewText(
  message: RawMessage,
  selfUserid: string,
  isDirect: boolean,
): string {
  const text = message.text?.replace(/\s+/g, " ").trim() ?? "";
  let body = text;
  if (body.length === 0) {
    if (message.photoId) body = "Foto";
    else if (message.fileId) body = "Datei";
  }
  if (body.length === 0) return "";

  if (message.userid.toLowerCase() === selfUserid.trim().toLowerCase()) {
    return `Du: ${body}`;
  }
  if (!isDirect) {
    const author = message.userNick?.trim() || message.userid;
    return `${author}: ${body}`;
  }
  return body;
}

export function formatChatListTime(epochMs: number, nowMs: number): string {
  const date = new Date(epochMs);
  const now = new Date(nowMs);

  const localDay = (value: Date): number =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((localDay(now) - localDay(date)) / 86_400_000);

  if (dayDiff === 0) return formatClock(epochMs);
  if (dayDiff === 1) return "Gestern";
  if (dayDiff >= 2 && dayDiff <= 6) {
    const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    return weekdays[(date.getDay() + 6) % 7];
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}
