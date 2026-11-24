import type { RawMessage } from "@/storage/types";

export const SWIPE_START = 10;
export const SWIPE_REPLY = 56;

export function isHorizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= SWIPE_START && Math.abs(dx) > Math.abs(dy) * 1.25;
}

export function swipeOffset(dx: number) {
  return Math.max(-72, Math.min(72, dx));
}

export function replyPreview(message: RawMessage, selfUserid: string) {
  const author = message.userid === selfUserid
    ? "Du"
    : message.userNick?.trim() || message.userFullname?.trim() || message.userid;
  const text = message.text?.replace(/\s+/g, " ").trim()
    || (message.photoId ? "Foto" : message.fileId ? "Datei" : "Nachricht");
  return { author, text: text.length > 220 ? `${text.slice(0, 219)}…` : text };
}

export function replyText(text: string, quote: ReturnType<typeof replyPreview> | null) {
  if (!quote) return text;
  // Escape markup in the excerpt so the original message is quoted as literal text.
  const excerpt = `${quote.author} · ${quote.text}`.replace(/\s+/g, " ")
    .replace(/[\\`*_{}[\]()#+.!|>~<-]/g, "\\$&");
  return `> ${excerpt}\n\n${text}`;
}
