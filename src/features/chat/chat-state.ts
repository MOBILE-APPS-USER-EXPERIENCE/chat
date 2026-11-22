import type { Chat } from '@/api/types';

export const CHAT_POLL_INTERVAL = 5000;

// A listing fetched around creation can lag behind the create/join response.
// Keep confirmed creations until the server first includes them in its listing.
export function reconcileChats(snapshot: Chat[], pending: Map<number, Chat>): Chat[] {
  for (const chat of snapshot) pending.delete(chat.chatid);
  return [...snapshot, ...pending.values()];
}
