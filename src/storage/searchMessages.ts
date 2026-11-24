import { normalizeSearchText } from "../utils/search-text";
import type { AccountMessageTags } from "./messageTags";
import type { MessageRepository } from "./ports";
import type { ChatRow, RawMessage } from "./types";

const PAGE_SIZE = 100;

export type MessageSearchHit = { chat: ChatRow; message: RawMessage; tags: string[] };

export async function searchMessages(
  messages: Pick<MessageRepository, "listPage">,
  chats: readonly ChatRow[],
  tagsByChat: AccountMessageTags,
  query: string,
  signal?: AbortSignal,
): Promise<MessageSearchHit[]> {
  const term = normalizeSearchText(query);
  const hits: MessageSearchHit[] = [];
  if (!term) return hits;

  for (const chat of chats) {
    let beforeId: number | undefined;
    const chatTags = tagsByChat[chat.id];
    while (!signal?.aborted) {
      const page = await messages.listPage(chat.id, { beforeId, limit: PAGE_SIZE });
      if (signal?.aborted) return [];
      for (const message of page) {
        const tags = chatTags?.[message.id] ?? [];
        if (normalizeSearchText(message.text ?? "").includes(term) ||
          tags.some((tag) => normalizeSearchText(tag).includes(term))) {
          hits.push({ chat, message, tags });
        }
      }
      if (page.length < PAGE_SIZE) break;
      beforeId = page[page.length - 1].id;
      // SQLite reads synchronously on some platforms. Yield between pages for typing and scrolling.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (signal?.aborted) return [];
  }

  return hits.sort((a, b) => (b.message.sentAt ?? b.message.receivedAt) - (a.message.sentAt ?? a.message.receivedAt)
    || b.message.id - a.message.id);
}
