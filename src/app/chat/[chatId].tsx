import { useLocalSearchParams } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { Button, Spinner, Text, TextArea, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import {
  Check,
  ClockFading,
  CloudUpload,
  OctagonX,
  SendHorizontal,
} from "@/components/icons";
import { Spacing } from "@/constants/layout";
import { useChat } from "@/hooks/use-chat";
import { useMessages } from "@/hooks/use-messages";
import { useOutbox } from "@/hooks/use-outbox";
import { useSession } from "@/session/useSession";
import type { OutboxRow, RawMessage } from "@/storage/types";
import { formatTime } from "@/utils/format-date-times";

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 minutes

function getAuthorId(entry: ListEntry | undefined, currentUserId: string) {
  if (!entry) return undefined;
  return entry.kind === "message" ? entry.message.userid : currentUserId;
}

function getTimestamp(entry: ListEntry | undefined): number | undefined {
  if (!entry) return undefined;
  return entry.kind === "message" ? entry.message.receivedAt : Date.now();
}

function Bubble({
  isOwn,
  isGroupStart,
  isNewest,
  children,
  ...rest
}: Readonly<{
  isOwn: boolean;
  isGroupStart: boolean;
  isNewest: boolean;
  children: React.ReactNode;
}> &
  React.ComponentProps<typeof YStack>) {
  return (
    <YStack
      w="100%"
      px={Spacing.three}
      mb={isNewest ? Spacing.two : 0}
      mt={isGroupStart ? Spacing.two : Spacing.one}
      items={isOwn ? "flex-end" : "flex-start"}
    >
      <YStack
        maxW="90%"
        gap={Spacing.one}
        px={Spacing.three}
        py={Spacing.two}
        {...rest}
      >
        {children}
      </YStack>
    </YStack>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  isOwn,
  isGroupStart,
  isNewest,
}: Readonly<{
  message: RawMessage;
  isOwn: boolean;
  isGroupStart: boolean;
  isNewest: boolean;
}>) {
  const topLeftRadius = !isGroupStart || isOwn ? 8 : 0;
  const topRightRadius = !isGroupStart || !isOwn ? 8 : 0;

  return (
    <Bubble
      isOwn={isOwn}
      isGroupStart={isGroupStart}
      isNewest={isNewest}
      borderTopLeftRadius={topLeftRadius}
      borderTopRightRadius={topRightRadius}
      borderBottomLeftRadius={8}
      borderBottomRightRadius={8}
      backgroundColor={isOwn ? "backgroundSelected" : "backgroundElement"}
    >
      {isGroupStart && !isOwn && (
        <Text fontWeight="600" color="text">
          {message.userNick ?? message.userFullname ?? message.userid}
        </Text>
      )}
      <Text color="text">{message.text ?? ""}</Text>

      <XStack
        gap={Spacing.two}
        items="center"
        justify="flex-end"
        mr={-Spacing.two}
      >
        <Text color="textSecondary" fontSize={11} self="flex-end">
          {formatTime(message.receivedAt)}
        </Text>
        {isOwn && <Check color="textSecondary" size={12} />}
      </XStack>
    </Bubble>
  );
});

function describeOutboxError(lastError: string | null): string {
  if (lastError === "offline") return "Keine Verbindung";
  if (lastError === "chat_not_found") return "Chat nicht mehr verfügbar";
  return "Senden fehlgeschlagen";
}

function PendingRow({
  row,
  isGroupStart,
  isNewest,
}: Readonly<{ row: OutboxRow; isGroupStart: boolean; isNewest: boolean }>) {
  return (
    <Bubble
      isOwn
      isGroupStart={isGroupStart}
      isNewest={isNewest}
      borderTopLeftRadius={8}
      borderTopRightRadius={isGroupStart ? 0 : 8}
      borderBottomLeftRadius={8}
      borderBottomRightRadius={8}
      backgroundColor="backgroundSelected"
    >
      <Text color="text">{row.text ?? ""}</Text>

      <XStack
        gap={Spacing.two}
        items="center"
        justify="flex-end"
        mr={-Spacing.two}
      >
        {row.status === "failed" && (
          <Text color="error" fontSize={12}>
            {describeOutboxError(row.lastError)}
          </Text>
        )}
        <Text color="textSecondary" fontSize={11} self="flex-end">
          {formatTime(row.createdAt)}
        </Text>

        {row.status === "sending" && (
          <CloudUpload color="textSecondary" size={12} />
        )}
        {row.status === "failed" && row.lastError !== "offline" ? (
          <OctagonX color="textSecondary" size={12} />
        ) : (
          <ClockFading color="textSecondary" size={12} />
        )}
      </XStack>
    </Bubble>
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
  const session = useSession();

  const currentUserId =
    session?.status === "signed_in" ? session.account.userid : "";

  // `messages` is newest-first (for the inverted list); `pending` is oldest-first (the
  // repository's contract). Pending rows are always newer than any confirmed message, so they
  // go first in the combined, newest-first array — reversed, so the most recently typed
  // message renders closest to the input box at the bottom of the inverted list.
  const entries = useMemo<ListEntry[]>(
    () => [
      ...[...pending]
        .reverse()
        .map((row): ListEntry => ({ kind: "pending", row })),
      ...messages.map((message): ListEntry => ({ kind: "message", message })),
    ],
    [messages, pending],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ListEntry; index: number }) => {
      const prev = entries[index + 1];
      const previousAuthor = getAuthorId(prev, currentUserId);
      const prevTime = getTimestamp(prev);
      const time = getTimestamp(item);

      const sameAuthor =
        (item.kind === "pending" ? currentUserId : item.message.userid) ===
        previousAuthor;
      const closeInTime =
        prevTime !== undefined &&
        time !== undefined &&
        time - prevTime < GROUP_GAP_MS;
      const isGroupStart = !(sameAuthor && closeInTime);

      const isNewest = index === 0; // the list is inverted, so index 0 is the newest message

      if (item.kind === "pending")
        return (
          <PendingRow
            row={item.row}
            isGroupStart={isGroupStart}
            isNewest={isNewest}
          />
        );

      return (
        <MessageRow
          message={item.message}
          isOwn={item.message.userid === currentUserId}
          isGroupStart={isGroupStart}
          isNewest={isNewest}
        />
      );
    },
    [entries, currentUserId],
  );

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
          renderItem={renderItem}
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
