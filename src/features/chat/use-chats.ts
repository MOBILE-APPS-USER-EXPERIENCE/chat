import { useCallback, useEffect, useRef, useState } from 'react';

import { createChat, getChats, joinChat } from '@/api/chatService';
import { getMessages, postMessage } from '@/api/messageService';
import type { Chat, Message, User } from '@/api/types';

import { errorText, mergeMessages } from './format';
import { CHAT_POLL_INTERVAL, reconcileChats } from './chat-state';
import type { Session } from './use-session';

export function useChats(session: Session, onError: (error: unknown, token: string) => void) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, Message[]>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [sendingChats, setSendingChats] = useState<Record<number, boolean>>({});
  const sendLocks = useRef(new Set<number>());
  const alive = useRef(true);
  const listBusy = useRef(false);
  const listVersion = useRef(0);
  const pendingChats = useRef(new Map<number, Chat>());
  const messageCache = useRef<Record<number, Message[]>>({});
  const selected = chats.find((chat) => chat.chatid === selectedId) ?? null;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const refreshChats = useCallback(() => {
    if (listBusy.current) return Promise.resolve();
    listBusy.current = true;
    const version = listVersion.current;
    return getChats(false).then((result) => {
      if (!alive.current || version !== listVersion.current) return;
      const reconciled = reconcileChats(result, pendingChats.current);
      setChats(reconciled);
      setSelectedId((id) => reconciled.some((chat) => chat.chatid === id) ? id : null);
      setListError('');
    }).catch((error) => {
      if (!alive.current) return;
      onError(error, session.token);
      setListError(errorText(error));
    }).finally(() => {
      listBusy.current = false;
      if (alive.current) setListLoading(false);
    });
  }, [onError, session.token]);

  useEffect(() => {
    void refreshChats();
    const timer = setInterval(() => { void refreshChats(); }, CHAT_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [refreshChats]);

  useEffect(() => {
    if (selectedId === null || !selected?.joined) return;
    const id = selectedId;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const cached = messageCache.current[id] ?? [];
        const result = await getMessages({
          chatid: id, fromid: cached.at(-1)?.id ?? 0, useAdminKey: false,
        });
        if (stopped || !alive.current) return;
        const merged = mergeMessages(messageCache.current[id] ?? [], result);
        messageCache.current[id] = merged;
        if (result.length) setMessages((current) => ({ ...current, [id]: merged }));
        setMessageError('');
      } catch (error) {
        if (stopped || !alive.current) return;
        onError(error, session.token);
        setMessageError(errorText(error));
      } finally {
        if (!stopped && alive.current) {
          setMessageLoading(false);
          timer = setTimeout(poll, CHAT_POLL_INTERVAL);
        }
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [selectedId, selected?.joined, refreshVersion, onError, session.token]);

  const send = useCallback(async (chatid: number, text: string) => {
    if (sendLocks.current.has(chatid)) return false;
    sendLocks.current.add(chatid);
    setSendingChats((current) => ({ ...current, [chatid]: true }));
    try {
      await postMessage({ chatid, text });
    } catch (error) {
      if (alive.current) onError(error, session.token);
      throw error;
    } finally {
      sendLocks.current.delete(chatid);
      if (alive.current) setSendingChats((current) => ({ ...current, [chatid]: false }));
    }
    if (alive.current) setRefreshVersion((version) => version + 1);
    return true;
  }, [onError, session.token]);

  const join = useCallback(async (chatid: number) => {
    try {
      await joinChat(chatid);
      if (!alive.current) return;
      listVersion.current += 1;
      const pending = pendingChats.current.get(chatid);
      if (pending) pendingChats.current.set(chatid, { ...pending, joined: true });
      setChats((current) => current.map((chat) => chat.chatid === chatid
        ? { ...chat, joined: true, role: chat.role === 'owner' ? 'owner' : 'member' } : chat));
      setMessageLoading(true);
      void refreshChats();
    } catch (error) {
      if (alive.current) onError(error, session.token);
      throw error;
    }
  }, [onError, session.token, refreshChats]);

  const create = useCallback(async (chatname: string, ispublic: boolean, directchat = false) => {
    try {
      const chatid = await createChat({ chatname, ispublic, directchat });
      if (alive.current) {
        listVersion.current += 1;
        const chat: Chat = { chatid, chatname, visibility: ispublic ? 'public' : 'private',
          directchat, joined: false, role: 'owner', owner: session, participants: [session], invited: [] };
        pendingChats.current.set(chatid, chat);
        setChats((current) => [...current.filter((item) => item.chatid !== chatid), chat]);
        setSelectedId(chatid);
        setMessageError('');
        setMessageLoading(true);
        void refreshChats();
      }
      return chatid;
    } catch (error) {
      if (alive.current) onError(error, session.token);
      throw error;
    }
  }, [session, onError, refreshChats]);

  return {
    chats, selected, selectedId, messages, listLoading, listError, messageLoading, messageError, sendingChats,
    selectChat: (id: number | null) => {
      setMessageError('');
      setMessageLoading(id !== null && !messageCache.current[id]?.length);
      setSelectedId(id);
    },
    refreshChats: () => { setListLoading(true); return refreshChats(); },
    refreshMessages: () => { setMessageError(''); setRefreshVersion((version) => version + 1); }, send, join, create,
    invitationSent: (chatid: number, user: User) => {
      const append = (chat: Chat) => ({ ...chat, invited: [...(chat.invited ?? []).filter((person) => person.hash !== user.hash), user] });
      const pending = pendingChats.current.get(chatid);
      if (pending) pendingChats.current.set(chatid, append(pending));
      listVersion.current += 1;
      setChats((current) => current.map((chat) => chat.chatid === chatid ? append(chat) : chat));
    },
    openCreated: (chatid: number) => { setSelectedId(chatid); setMessageError(''); setRefreshVersion((version) => version + 1); void refreshChats(); },
  };
}
