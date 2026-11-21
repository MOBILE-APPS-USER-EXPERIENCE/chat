import { router } from "expo-router";
import { FlatList } from "react-native";
import { Button, Spinner, Text, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import { Spacing } from "@/constants/layout";
import { useChats } from "@/hooks/use-chats";
import type { ChatRow } from "@/storage/types";

function roleLabel(chat: ChatRow): string {
  if (chat.role === "owner") return "Inhaber";
  if (chat.role === "admin") return "Admin";
  return chat.visibility === "public" ? "Öffentlich" : "Privat";
}

function ChatListItem({ chat }: Readonly<{ chat: ChatRow }>) {
  return (
    <Button
      variant="quiet"
      justify="flex-start"
      onPress={() =>
        router.push({
          pathname: "/chat/[chatId]",
          params: { chatId: String(chat.id) },
        })
      }
    >
      <XStack items="center" gap={Spacing.two} flex={1}>
        <Text flex={1} fontWeight="600" color="text">
          {chat.name}
        </Text>
        <Text color="textSecondary">{roleLabel(chat)}</Text>
      </XStack>
    </Button>
  );
}

export default function Index() {
  const { chats, loading } = useChats({ joined: true });

  return (
    <YStack flex={1} backgroundColor="background" pb={Spacing.four}>
      <Header title="Chats" showBackButton={false} />

      <YStack flex={1} gap={Spacing.two} px={Spacing.four} pt={Spacing.two}>
        {loading ? (
          <YStack flex={1} items="center" justify="center">
            <Spinner size="large" color="accent" />
          </YStack>
        ) : chats.length === 0 ? (
          <YStack flex={1} items="center" justify="center">
            <Text color="textSecondary">Du bist noch in keinem Chat.</Text>
          </YStack>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(chat) => String(chat.id)}
            renderItem={({ item }) => <ChatListItem chat={item} />}
          />
        )}
      </YStack>
    </YStack>
  );
}
