import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList } from "react-native";
import { Button, isWeb, Spinner, Text, XStack, YStack } from "tamagui";

import Avatar from "@/components/avatar";
import ExamPhaseCard from "@/components/exam-phase-card";
import Header from "@/components/header";
import { MessageSearchInput, MessageSearchResults } from "@/components/message-search";
import { Plus } from "@/components/icons";
import { config } from "@/config/config";
import { Spacing } from "@/config/layout";
import { useChatMembers } from "@/hooks/use-chat-members";
import { useChatPreviews } from "@/hooks/use-chat-previews";
import { useChats } from "@/hooks/use-chats";
import { useProfiles } from "@/hooks/use-profiles";
import { useSession } from "@/session";
import type { ChatRow, RawMessage } from "@/storage/types";
import { chatDisplayName } from "@/utils/chat-actions";
import {
  formatChatListTime,
  previewText,
  sortChatsByActivity,
} from "@/utils/chat-list-view";

function ChatListItem({
  chat,
  profiles,
  selfUserid,
  latest,
  nowMs,
}: Readonly<{
  chat: ChatRow;
  profiles: import("@/storage/types").ProfileRow[];
  selfUserid: string;
  latest: RawMessage | undefined;
  nowMs: number;
}>) {
  const { members } = useChatMembers(chat.id, chat.directchat);
  const displayName = chatDisplayName({
    chat,
    members,
    profiles,
    selfUserid,
  });
  return (
    <Button
      variant={"quiet"}
      justify="flex-start"
      onPress={() =>
        router.push({
          pathname: "/chat/[chatId]",
          params: { chatId: String(chat.id) },
        })
      }
      backgroundColor={"hover:backgroundSelected press:backgroundSelected"}
    >
      <XStack
        flex={1}
        gap={Spacing.two}
        items="center"
        justify="flex-start"
        w="100%"
      >
        <Avatar
          label={`Avatar für ${displayName}`}
          placeholder={displayName[0]?.toUpperCase() ?? "A"}
          mr={Spacing.two}
        />
        <YStack items="flex-start" gap={Spacing.two} flex={1} w="100%">
          <XStack items="center" w="100%" justify="space-between">
            <Text fontWeight="600" color="text" fontSize={16}>
              {displayName}
            </Text>

            <Text color="textSecondary" fontSize={12}>
              {formatChatListTime(
                latest
                  ? latest.sentAt ?? latest.receivedAt
                  : chat.firstSeenAt,
                nowMs,
              )}
            </Text>
          </XStack>

          <Text
            fontWeight="400"
            color="textSecondary"
            fontSize={14}
            numberOfLines={1}
          >
            {latest
              ? previewText(latest, selfUserid, chat.directchat) || "Noch keine Nachrichten"
              : "Noch keine Nachrichten"}
          </Text>
        </YStack>
      </XStack>
    </Button>
  );
}

function ChatListBody({
  loading,
  chats,
  profiles,
  selfUserid,
  latestByChat,
  nowMs,
}: Readonly<{
  loading: boolean;
  chats: ChatRow[];
  profiles: import("@/storage/types").ProfileRow[];
  selfUserid: string;
  latestByChat: Record<number, RawMessage>;
  nowMs: number;
}>) {
  if (loading) {
    return (
      <YStack flex={1} items="center" justify="center">
        <Spinner size="large" color="accent" />
      </YStack>
    );
  }
  if (chats.length === 0) {
    return (
      <YStack flex={1} items="center" justify="center">
        <Text color="textSecondary">Du bist noch in keinem Chat.</Text>
      </YStack>
    );
  }
  return (
    <FlatList
      data={chats}
      keyExtractor={(chat) => String(chat.id)}
      renderItem={({ item }) => (
        <ChatListItem
          chat={item}
          profiles={profiles}
          selfUserid={selfUserid}
          latest={latestByChat[item.id]}
          nowMs={nowMs}
        />
      )}
    />
  );
}

function NewChatButton() {
  return <Button
    circular
    size="lg"
    aria-label="Neuer Chat"
    onPress={() => router.push("/new-chat")}
    backgroundColor="accent"
    color="accentContrast"
  >
    <Plus color="accentContrast" />
  </Button>
}

export default function Index() {
  const { chats, loading } = useChats({ joined: true });
  const previews = useChatPreviews();
  const { profiles } = useProfiles();
  const [nowMs, setNowMs] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const session = useSession();
  const selfUserid =
    session.status === "signed_in" ? session.account.userid : "";
  const sortedChats = useMemo(
    () => sortChatsByActivity(chats, previews.latestByChat),
    [chats, previews.latestByChat],
  );
  useEffect(() => {
    const timer = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <YStack flex={1} backgroundColor="background" pb={Spacing.four}>
      <Header
        title={config.appName}
        showBackButton={false}
        action={
          isWeb ? (
            <NewChatButton />
          ) : undefined
        }
      />

      <YStack flex={1} gap={Spacing.two} pt={Spacing.two}>
        <MessageSearchInput value={searchQuery} onChange={setSearchQuery} />
        {searchQuery.trim() ? (
          <MessageSearchResults accountId={session.status === "signed_in" ? session.account.id : undefined}
            query={searchQuery} profiles={profiles} selfUserid={selfUserid}
            onSelectChat={(chat) => router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chat.id) } })}
            onSelect={({ chat, message }) => {
              router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chat.id), messageId: String(message.id) } });
            }} />
        ) : (
          <>
            <ExamPhaseCard />
            <ChatListBody
              loading={loading}
              chats={sortedChats}
              profiles={profiles}
              selfUserid={selfUserid}
              latestByChat={previews.latestByChat}
              nowMs={nowMs}
            />
          </>
        )}
      </YStack>
      {!isWeb && (
        <YStack
          self="flex-end"
          mr={Spacing.three}
          mb={Spacing.two}
        >
          <NewChatButton />
        </YStack>
      )}
    </YStack>
  );
}
