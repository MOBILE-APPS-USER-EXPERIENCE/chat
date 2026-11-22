import { router } from "expo-router";
import { FlatList } from "react-native";
import { Button, Spinner, Text, XStack, YStack } from "tamagui";

import Avatar from "@/components/avatar";
import Header from "@/components/header";
import { config } from "@/constants/config";
import { Spacing } from "@/constants/layout";
import { useChats } from "@/hooks/use-chats";
import type { ChatRow } from "@/storage/types";
import { formatDateRelative } from "@/utils/format-date-times";

function ChatListItem({ chat }: Readonly<{ chat: ChatRow }>) {
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
        <Avatar label={`Avatar für ${chat.name}`} placeholder={chat.name[0]} />
        <YStack items="flex-start" gap={Spacing.two} flex={1} w="100%">
          <XStack items="center" w="100%" justify="space-between">
            <Text fontWeight="600" color="text" fontSize={16}>
              {chat.name}
            </Text>

            {chat.lastPolledAt && (
              <Text color="textSecondary" fontSize={12}>
                Placeholder: {formatDateRelative(chat.firstSeenAt)}
              </Text>
            )}
          </XStack>

          <Text fontWeight="400" color="textSecondary" fontSize={14}>
            Placeholder für die letzte Nachricht
          </Text>
        </YStack>
      </XStack>
    </Button>
  );
}

function ChatListBody({
  loading,
  chats,
}: Readonly<{ loading: boolean; chats: ChatRow[] }>) {
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
      renderItem={({ item }) => <ChatListItem chat={item} />}
    />
  );
}

export default function Index() {
  const { chats, loading } = useChats({ joined: true });

  return (
    <YStack flex={1} backgroundColor="background" pb={Spacing.four}>
      <Header title={config.appName} showBackButton={false} />

      <YStack flex={1} gap={Spacing.two} px={Spacing.four} pt={Spacing.two}>
        <ChatListBody loading={loading} chats={chats} />
      </YStack>
    </YStack>
  );
}
