import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { Button, Spinner, Text, TextArea, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import { SendHorizontal } from "@/components/icons";
import { Spacing } from "@/constants/layout";
import { useChat } from "@/hooks/use-chat";
import { useMessages } from "@/hooks/use-messages";
import { useOutbox } from "@/hooks/use-outbox";
import type { OutboxRow, RawMessage } from "@/storage/types";

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

function describeOutboxError(lastError: string | null): string {
  if (lastError === "offline") return "Keine Verbindung";
  if (lastError === "chat_not_found") return "Chat nicht mehr verfügbar";
  return "Senden fehlgeschlagen";
}

function PendingRow({ row }: Readonly<{ row: OutboxRow }>) {
  return (
    <YStack gap={Spacing.one} px={Spacing.three} py={Spacing.two}>
      <Text fontWeight="600" color="text">
        Ich
      </Text>
      <Text color="text">{row.text ?? ""}</Text>
      {row.status === "sending" && (
        <Text color="textSecondary" fontSize={12}>
          Wird gesendet…
        </Text>
      )}
      {row.status === "failed" && (
        <Text color="error" fontSize={12}>
          {describeOutboxError(row.lastError)}
        </Text>
      )}
    </YStack>
  );
}

type ListEntry =
  | { kind: "message"; message: RawMessage }
  | { kind: "pending"; row: OutboxRow };

export default function ChatScreen() {
  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId: string }>();
  const chatId = Number(chatIdParam);
  const { chat } = useChat(chatId);
  const { messages, loading, loadOlder } = useMessages(chatId);
  const { pending, sending, send } = useOutbox(chatId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [inputHeight, setInputHeight] = useState(44);

  // `messages` is newest-first (for the inverted list); `pending` is oldest-first (the
  // repository's contract). Pending rows are always newer than any confirmed message, so they
  // go first in the combined, newest-first array — reversed, so the most recently typed
  // message renders closest to the input box at the bottom of the inverted list.
  const entries: ListEntry[] = [
    ...[...pending]
      .reverse()
      .map((row): ListEntry => ({ kind: "pending", row })),
    ...messages.map((message): ListEntry => ({ kind: "message", message })),
  ];

  const canSend = text.trim().length > 0 && !sending;

  async function handleSend() {
    const toSend = text;
    setError(undefined);
    try {
      await send(toSend);
      setText("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Senden fehlgeschlagen.",
      );
    }
  }

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
          data={entries}
          keyExtractor={(entry) =>
            entry.kind === "message"
              ? `m-${entry.message.id}`
              : `p-${entry.row.clientMessageId}`
          }
          renderItem={({ item }) =>
            item.kind === "message" ? (
              <MessageRow message={item.message} />
            ) : (
              <PendingRow row={item.row} />
            )
          }
          inverted
          // `entries` is newest-first; `inverted` renders index 0 at the bottom (newest), so the
          // list's "end" (its last data item) is the oldest loaded message, rendered at the top —
          // exactly where more history should be fetched from.
          onEndReached={() => {
            void loadOlder();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
      <KeyboardAvoidingView behavior="padding">
        <YStack
          gap={Spacing.one}
          px={Spacing.three}
          py={Spacing.two}
          borderTopWidth={1}
          borderColor="backgroundSelected"
        >
          <XStack gap={Spacing.two} items="flex-end">
            <TextArea
              flex={1}
              value={text}
              onChangeText={setText}
              placeholder="Nachricht…"
              borderColor="backgroundSelected"
              color="text"
              h={inputHeight}
              minH={44}
              maxH={120}
              px={Spacing.three}
              py={Spacing.two}
              textAlignVertical="top"
              onKeyDown={(e) => {
                const { key, shiftKey } = e.nativeEvent as {
                  key: string;
                  shiftKey?: boolean;
                };
                if (Platform.OS === "web" && key === "Enter" && !shiftKey) {
                  if ("preventDefault" in e) e.preventDefault();
                  if (canSend) void handleSend();
                }
              }}
              onContentSizeChange={(e) =>
                setInputHeight(
                  Math.min(120, Math.max(44, e.nativeEvent.contentSize.height)),
                )
              }
            />
            <Button disabled={!canSend} onPress={() => void handleSend()}>
              {sending ? (
                <Spinner color="text" />
              ) : (
                <SendHorizontal color="text" />
              )}
            </Button>
          </XStack>

          {!!error && <Text color="error">{error}</Text>}
        </YStack>
      </KeyboardAvoidingView>
    </YStack>
  );
}
