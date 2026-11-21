// src/app/chat/[chatId].tsx
import { useLocalSearchParams } from "expo-router";
import { FlatList } from "react-native";
import { Spinner, Text, YStack } from "tamagui";

import Header from "@/components/header";
import { Spacing } from "@/constants/layout";
import { useChat } from "@/hooks/use-chat";
import { useMessages } from "@/hooks/use-messages";
import type { RawMessage } from "@/storage/types";

function MessageRow({ message }: Readonly<{ message: RawMessage }>) {
  return (
    <YStack gap={Spacing.one} px={Spacing.three} py={Spacing.two}>
      <Text fontWeight="600" color="text">
        {message.userid}
      </Text>
      <Text color="text">{message.text ?? ""}</Text>
    </YStack>
  );
}

export default function ChatScreen() {
  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId: string }>();
  const chatId = Number(chatIdParam);
  const { chat } = useChat(chatId);
  const { messages, loading, loadOlder } = useMessages(chatId);

  return (
    <YStack flex={1} backgroundColor="background">
      <Header
        title={chat?.name ?? "…"}
        avatar={{ label: "Avatar", placeholder: "A" }}
        showBackButton={true}
      />
      {loading ? (
        <YStack flex={1} items="center" justify="center">
          <Spinner size="large" color="accent" />
        </YStack>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(message) => String(message.id)}
          renderItem={({ item }) => <MessageRow message={item} />}
          inverted
          // `messages` is newest-first; `inverted` renders index 0 at the bottom (newest), so the
          // list's "end" (its last data item) is the oldest loaded message, rendered at the top —
          // exactly where more history should be fetched from.
          onEndReached={() => {
            void loadOlder();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </YStack>
  );
}
