import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { storageEvents, syncRuntime } from "@/messaging/runtime";
import { messageTagsStore } from "@/storage";
import { searchMessages, type MessageSearchHit } from "@/storage/searchMessages";
import type { ChatRow, ProfileRow } from "@/storage/types";
import { chatDisplayName } from "@/utils/chat-actions";
import { normalizeSearchText } from "@/utils/search-text";

export type ChatSearchHit = { chat: ChatRow; name: string };

export function useMessageSearch(accountId: string | undefined, query: string, options?: {
  chatId?: number;
  profiles?: readonly ProfileRow[];
  selfUserid?: string;
}) {
  const { chatId, profiles, selfUserid = "" } = options ?? {};
  const term = normalizeSearchText(query);
  const key = JSON.stringify([accountId, chatId, term]);
  const [result, setResult] = useState<{ key: string; hits: MessageSearchHit[]; chats: ChatSearchHit[]; error?: boolean }>();

  useFocusEffect(useCallback(() => {
    if (!accountId || !term) return;
    const id = accountId;
    const abort = new AbortController();
    let searching = false;
    let refreshPending = false;
    let awaitingStorage = true;
    let timer: ReturnType<typeof setTimeout>;

    async function search() {
      searching = true;
      try {
        const storage = syncRuntime.getAccountStorage();
        if (!storage) {
          awaitingStorage = true;
          if (!abort.signal.aborted) setResult({ key, hits: [], chats: [], error: true });
          return;
        }
        awaitingStorage = false;
        const chats = chatId === undefined
          ? await storage.chats.list({ joined: true })
          : [await storage.chats.get(chatId)].filter((chat) => chat !== null);
        const chatHits: ChatSearchHit[] = [];
        if (chatId === undefined) {
          for (const chat of chats) {
            if (abort.signal.aborted) return;
            const members = chat.directchat ? await storage.chats.listMembers(chat.id) : [];
            const name = chatDisplayName({ chat, members, profiles: profiles ?? [], selfUserid });
            if (normalizeSearchText(name).includes(term) || normalizeSearchText(chat.name).includes(term)) {
              chatHits.push({ chat, name });
            }
          }
          chatHits.sort((a, b) => a.name.localeCompare(b.name, "de"));
        }
        const tags = await messageTagsStore.listAll(id);
        const hits = await searchMessages(storage.messages, chats, tags, term, abort.signal);
        if (!abort.signal.aborted) setResult({ key, hits, chats: chatHits });
      } catch {
        if (!abort.signal.aborted) setResult({ key, hits: [], chats: [], error: true });
      } finally {
        searching = false;
        if (refreshPending && !abort.signal.aborted) {
          refreshPending = false;
          schedule();
        }
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (searching) {
        refreshPending = true;
        return;
      }
      timer = setTimeout(() => { void search(); }, 180);
    }

    schedule();
    const unsubscribeStatus = syncRuntime.subscribeStatus(() => { if (awaitingStorage) schedule(); });
    const unsubscribeChats = storageEvents.subscribeChats(schedule);
    const unsubscribeMessages = chatId === undefined
      ? storageEvents.subscribeAnyMessages(schedule)
      : storageEvents.subscribeMessages(chatId, schedule);
    return () => {
      abort.abort();
      clearTimeout(timer);
      unsubscribeStatus();
      unsubscribeChats();
      unsubscribeMessages();
    };
  }, [accountId, chatId, key, profiles, selfUserid, term]));

  return result?.key === key ? result : undefined;
}
