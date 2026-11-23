import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView } from "react-native";
import { Button, isWeb, Spinner, Text, TextArea, XStack, YStack } from "tamagui";

import ConfirmDialog from "@/components/confirm-dialog";
import Header from "@/components/header";
import {
  Check,
  ClockFading,
  CloudUpload,
  OctagonX,
  SendHorizontal,
  UserPlus,
} from "@/components/icons";
import { Spacing } from "@/config/layout";
import { useChat } from "@/hooks/use-chat";
import { useChatMembers } from "@/hooks/use-chat-members";
import { useMessages } from "@/hooks/use-messages";
import { useOutbox } from "@/hooks/use-outbox";
import { useProfiles } from "@/hooks/use-profiles";
import { useSession } from "@/session/useSession";
import type { OutboxRow, RawMessage } from "@/storage/types";
import { chatDisplayName } from "@/utils/chat-actions";
import { formatTime } from "@/utils/format-date-times";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 minutes

function getAuthorId(entry: ListEntry | undefined, currentUserId: string) {
  if (!entry) return undefined;
  return entry.kind === "message" ? entry.message.userid : currentUserId;
}

function getTimestamp(entry: ListEntry | undefined): number | undefined {
  if (!entry) return undefined;
  return entry.kind === "message"
    ? entry.message.sentAt ?? entry.message.receivedAt
    : entry.row.createdAt;
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
          {formatTime(message.sentAt ?? message.receivedAt)}
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
  onDiscard,
}: Readonly<{
  row: OutboxRow;
  isGroupStart: boolean;
  isNewest: boolean;
  onDiscard: (row: OutboxRow) => void;
}>) {
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
        {row.status === "pending" && (
          <ClockFading color="textSecondary" size={12} aria-label="Wird gesendet" />
        )}
        {row.status === "sending" && (
          <CloudUpload color="textSecondary" size={12} aria-label="Wird gerade gesendet" />
        )}
        {row.status === "failed" && row.lastError !== "offline" ? (
          <OctagonX color="textSecondary" size={12} aria-label="Senden fehlgeschlagen" />
        ) : (
          row.status === "failed" && (
            <ClockFading color="textSecondary" size={12} aria-label="Keine Verbindung" />
          )
        )}
      </XStack>
      {row.status === "failed" && (
        <Button
          py={Spacing.one}
          px={Spacing.two}
          self="flex-end"
          backgroundColor="error"
          color="errorText"
          onPress={() => onDiscard(row)}
        >
          Verwerfen
        </Button>
      )}
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
  const { pending, sending, send, discard } = useOutbox(chatId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [inputHeight, setInputHeight] = useState(44);
  const [discardRow, setDiscardRow] = useState<OutboxRow | null>(null);
  const session = useSession();
  const { profiles } = useProfiles();
  const { members } = useChatMembers(chatId);
  const insets = useSafeAreaInsets();

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
            onDiscard={setDiscardRow}
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
  const displayName =
    chat === null
      ? "…"
      : chatDisplayName({
        chat,
        members,
        profiles,
        selfUserid: currentUserId,
      });

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

  async function handleDiscard() {
    if (discardRow === null) return;
    const clientMessageId = discardRow.clientMessageId;
    setDiscardRow(null);
    setError(undefined);
    try {
      await discard(clientMessageId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nachricht konnte nicht verworfen werden.",
      );
    }
  }

  return (
    <YStack flex={1} backgroundColor="background"
      pb={insets.bottom}>
      <Header
        title={displayName}
        avatar={{
          label: `Avatar für ${displayName}`,
          placeholder: displayName[0]?.toUpperCase() ?? "A",
        }}
        showBackButton={true}
        action={
          chat !== null &&
            chat.role === "owner" &&
            !chat.directchat &&
            chat.id !== 0 ? (
            <Button
              variant="quiet"
              aria-label="Person einladen"
              onPress={() =>
                router.push({
                  pathname: "/invite/[chatId]",
                  params: { chatId: String(chat.id) },
                })
              }
            >
              <UserPlus color="text" />
            </Button>
          ) : undefined
        }
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
          py={Spacing.three}
        >
          <XStack gap={Spacing.two} items="flex-end">
            <TextArea
              flex={1}
              value={text}
              onChangeText={setText}
              placeholder="Nachricht…"
              borderColor="backgroundSelected"
              color="text"
              backgroundColor="backgroundElement"
              placeholderTextColor="textSecondary"
              h={inputHeight}
              minH={Spacing.inputHeight}
              maxH={Spacing.maxNewMessageHeight}
              px={Spacing.three}
              py={Spacing.two}
              textAlignVertical="center"
              onKeyDown={(e) => {
                const { key, shiftKey, isComposing } = e.nativeEvent as {
                  key: string;
                  shiftKey?: boolean;
                  isComposing?: boolean;
                };
                if (isComposing) return;
                if (isWeb && key === "Enter" && !shiftKey) {
                  if ("preventDefault" in e) e.preventDefault();
                  if (canSend) void handleSend();
                }
              }}
              onContentSizeChange={(e) =>
                setInputHeight(
                  Math.min(Spacing.maxNewMessageHeight, Math.max(Spacing.inputHeight, e.nativeEvent.contentSize.height)),
                )
              }
            />
            <Button
              disabled={!canSend}
              onPress={() => void handleSend()}
              circular
              size="lg"
              mb={2}
              backgroundColor={canSend ? "accent" : "backgroundSelected"}
            >
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
      <ConfirmDialog
        visible={discardRow !== null}
        title="Nachricht verwerfen"
        message="Diese Nachricht wird aus der Warteschlange entfernt."
        confirmLabel="Verwerfen"
        destructive
        onConfirm={() => void handleDiscard()}
        onCancel={() => setDiscardRow(null)}
      />
    </YStack>
  );
}
