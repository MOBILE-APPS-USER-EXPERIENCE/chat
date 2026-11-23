import { useChats } from "./use-chats";
import {
  filterChatsByName,
  selectBrowsableChats,
  selectInvitations,
} from "../utils/chat-lists";

export function useInvitations() {
  const { chats, loading } = useChats({ joined: false });
  return { invitations: selectInvitations(chats), loading };
}

export function usePublicChats(query: string) {
  const { chats, loading } = useChats({ joined: false });
  return {
    chats: filterChatsByName(selectBrowsableChats(chats), query),
    loading,
  };
}
