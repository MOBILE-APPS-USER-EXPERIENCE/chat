import { router } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { Button, Input, Separator, Spinner, Text, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import { Spacing } from "@/config/layout";
import { usePublicChats } from "@/hooks/use-chat-lists";
import { useProfiles } from "@/hooks/use-profiles";
import { syncRuntime } from "@/messaging/runtime";
import type { ChatRow, ProfileRow } from "@/storage/types";
import { describeChatActionError } from "@/utils/chat-actions";

function ownerName(chat: ChatRow, profiles: ProfileRow[]): string {
  if (!chat.ownerUserid) return "unbekannt";
  const profile = profiles.find(
    (row) => row.userid.toLowerCase() === chat.ownerUserid?.toLowerCase(),
  );
  return profile?.nickname?.trim() ||
    profile?.fullname?.trim() ||
    chat.ownerUserid ||
    "unbekannt";
}

function PublicRow({
  chat,
  profiles,
}: Readonly<{ chat: ChatRow; profiles: ProfileRow[] }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setBusy(true);
    setError(undefined);
    try {
      await syncRuntime.joinChat(chat.id);
      router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chat.id) } });
    } catch (error_) {
      setError(describeChatActionError(error_, "join"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <XStack gap={Spacing.two} py={Spacing.four} justify="space-between">
      <YStack gap={Spacing.one}>
        <Text fontWeight="600" color="text">{chat.name}</Text>
        <Text color="textSecondary">Besitzer: {ownerName(chat, profiles)}</Text>
      </YStack>
      <Button disabled={busy} onPress={() => void join()} h={Spacing.inputHeight}>Beitreten</Button>
      {busy && <Spinner size="small" color="accent" />}
      {!!error && <Text color="error">{error}</Text>}
    </XStack>
  );
}

function EmptySafeChatList({
  chats,
  profiles,
  activeSearch,
}: Readonly<{
  chats: ChatRow[];
  profiles: ProfileRow[];
  activeSearch: boolean;
}>) {
  return chats.length === 0 ? (
    <YStack flex={1} items="center" justify="center">
      <Text color="textSecondary">
        {activeSearch ? "Keine Treffer." : "Keine öffentlichen Chats gefunden."}
      </Text>
    </YStack>
  ) : (
    <FlatList
      data={chats}
      keyExtractor={(chat) => String(chat.id)}
      renderItem={({ item }) => <PublicRow chat={item} profiles={profiles} />}
      ItemSeparatorComponent={<Separator borderColor={"backgroundSelected"} />}
    />
  )
}

export default function PublicScreen() {
  const [query, setQuery] = useState("");
  const { chats, loading } = usePublicChats(query);
  const { profiles } = useProfiles();
  const activeSearch = query.trim().length > 0;

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Öffentlich" showBackButton={false} />
      <YStack px={Spacing.three} pt={Spacing.two} pb={Spacing.one} gap={Spacing.two}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Chatname suchen"
          color="text"
          placeholderTextColor="textSecondary"
          aria-label="Chatname suchen"
          mb={Spacing.two}
          h={Spacing.inputHeight}
        />
        {loading ? (
          <YStack flex={1} items="center" justify="center"><Spinner size="large" color="accent" /></YStack>
        ) : <EmptySafeChatList chats={chats} profiles={profiles} activeSearch={activeSearch} />}
      </YStack>
    </YStack>
  );
}
