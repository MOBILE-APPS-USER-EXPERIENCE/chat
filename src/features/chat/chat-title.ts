import type { Chat, User } from '@/api/types';
import { decodeText } from './format';

export function personName(user: User): string {
  return decodeText(user.nickname || user.fullname || user.userid || 'Unbekannt');
}

export function directPeer(chat: Chat, ownHash: string): User | undefined {
  if (!chat.directchat) return;
  const people = [...(chat.participants ?? []), ...(chat.invited ?? []), ...(Array.isArray(chat.owner) ? [] : [chat.owner])];
  return people.find((user) => user.hash && user.hash !== ownHash);
}

export function chatTitle(chat: Chat, ownHash: string, aliases: Record<number, string> = {}): string {
  if (aliases[chat.chatid]) return aliases[chat.chatid];
  const peer = directPeer(chat, ownHash);
  return peer ? personName(peer) : decodeText(chat.chatname);
}
