import { router, useLocalSearchParams } from "expo-router";
import type { TamaguiElement } from "@tamagui/web";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView } from "react-native";
import { Button, isWeb, Spinner, Text, TextArea, XStack, YStack } from "tamagui";

import ConfirmDialog from "@/components/confirm-dialog";
import EditMessageBanner from "@/components/edit-message-banner";
import Header from "@/components/header";
import MessageMarkdown from "@/components/message-markdown";
import MessageOptionsButton from "@/components/message-options-button";
import MessageReactionPicker, { reactionLabel } from "@/components/message-reaction-picker";
import { MessageTagEditor, MessageTagFilter } from "@/components/message-tag-controls";
import { ChatSearchNavigation, MessageSearchInput } from "@/components/message-search";
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
import { useMessageEdit, type EditTarget } from "@/hooks/use-message-edit";
import { useMessageSwipe } from "@/hooks/use-message-swipe";
import { useMessages, useTaggedMessages } from "@/hooks/use-messages";
import { useMessageSearch } from "@/hooks/use-message-search";
import { useOutbox } from "@/hooks/use-outbox";
import { useProfiles } from "@/hooks/use-profiles";
import { syncRuntime } from "@/messaging/runtime";
import { useSession } from "@/session/useSession";
import { messageReactionsStore, messageTagsStore } from "@/storage";
import type { ChatMessageReactions } from "@/storage/messageReactions";
import type { ChatMessageTags } from "@/storage/messageTags";
import type { OutboxRow, RawMessage } from "@/storage/types";
import { chatDisplayName } from "@/utils/chat-actions";
import { formatClock } from "@/utils/format-date-times";
import {
  applyMessageEdits,
  canEditMessage,
  isEditChange,
  isEditMessageText,
  pendingEditsByTarget,
} from "@/utils/message-edit";
import { replyPreview, replyText } from "@/utils/message-reply";
import {
  formatMessageSelection,
  type MessageFormat,
  type MessageSelection,
} from "@/utils/format-message-selection";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 minutes
const NO_TAGS: string[] = [];

function getAuthorId(entry: ListEntry | undefined, currentUserId: string) {
  if (!entry || entry.kind === "day") return undefined;
  return entry.kind === "message" ? entry.message.userid : currentUserId;
}

function getTimestamp(entry: ListEntry | undefined): number | undefined {
  if (!entry || entry.kind === "day") return undefined;
  return entry.kind === "message"
    ? entry.message.sentAt ?? entry.message.receivedAt
    : entry.row.createdAt;
}

function Bubble({
  isOwn,
  isGroupStart,
  isNewest,
  children,
  gestureSurface,
  offset,
  ...rest
}: Readonly<{
  isOwn: boolean;
  isGroupStart: boolean;
  isNewest: boolean;
  children: React.ReactNode;
  gestureSurface?: React.ComponentProps<typeof YStack>;
  offset?: number;
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
      <YStack maxW="90%" {...gestureSurface}>
        <YStack gap={Spacing.one} px={Spacing.three} py={Spacing.two} x={offset} {...rest}>
          {children}
        </YStack>
      </YStack>
    </YStack>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  isOwn,
  isGroupStart,
  isNewest,
  tags,
  onOpenMenu,
  onEditTags,
  reaction,
  onReact,
  onReply,
  highlighted,
  edited,
  pendingEdit,
  onEdit,
  onRetryEdit,
}: Readonly<{
  message: RawMessage;
  isOwn: boolean;
  isGroupStart: boolean;
  isNewest: boolean;
  tags: readonly string[];
  onOpenMenu: (message: RawMessage) => void;
  onEditTags?: (id: number) => void;
  reaction?: string;
  onReact: (id: number, emoji: string) => void;
  onReply: (message: RawMessage) => void;
  highlighted: boolean;
  edited: boolean;
  pendingEdit?: PendingEdit;
  onEdit?: (message: RawMessage) => void;
  onRetryEdit: () => void;
}>) {
  const topLeftRadius = !isGroupStart || isOwn ? 8 : 0;
  const topRightRadius = !isGroupStart || !isOwn ? 8 : 0;
  const openMenu = useCallback(() => onOpenMenu(message), [message, onOpenMenu]);
  const reply = useCallback(() => onReply(message), [message, onReply]);
  const gesture = useMessageSwipe(reply, openMenu);

  return (
    <Bubble
      onLongPress={gesture.onLongPress}
      accessibilityActions={[{ name: "longpress", label: "Nachrichtenoptionen" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") openMenu();
      }}
      gestureSurface={gesture.surface}
      offset={gesture.offset}
      className="message-with-options"
      isOwn={isOwn}
      isGroupStart={isGroupStart}
      isNewest={isNewest}
      borderTopLeftRadius={topLeftRadius}
      borderTopRightRadius={topRightRadius}
      borderBottomLeftRadius={8}
      borderBottomRightRadius={8}
      backgroundColor={isOwn ? "backgroundSelected" : "backgroundElement"}
      borderWidth={highlighted ? 2 : 0}
      borderColor="accent"
    >
      {onEditTags && (
        // Sits in the bubble's left padding so the arrow never covers the text.
        <XStack position="absolute" t={0} l={-Spacing.one} z={1}>
          <MessageOptionsButton messageId={message.id} onEditTags={() => onEditTags(message.id)}
            reaction={reaction} onReact={(emoji) => onReact(message.id, emoji)} onReply={reply}
            onEdit={onEdit ? () => onEdit(message) : undefined} />
        </XStack>
      )}
      {isGroupStart && !isOwn && (
        <Text fontWeight="600" color="text">
          {message.userNick ?? message.userFullname ?? message.userid}
        </Text>
      )}
      <MessageMarkdown text={pendingEdit?.editText ?? message.text ?? ""} />
      {reaction && (
        <Text self="flex-start" color="text" backgroundColor="backgroundSecondary" rounded={Spacing.one}
          px={Spacing.two} py={Spacing.one} aria-label={`Deine lokale Reaktion: ${reactionLabel(reaction)}`}>
          {reaction}
        </Text>
      )}
      {tags.length > 0 && (
        <XStack gap={Spacing.one} flexWrap="wrap">
          {tags.map((tag) => (
            <Text key={tag} color="text" backgroundColor="backgroundSecondary"
              px={Spacing.two} py={Spacing.one} rounded={Spacing.one} overflowWrap="anywhere">
              {tag}
            </Text>
          ))}
        </XStack>
      )}

      <XStack
        gap={Spacing.two}
        items="center"
        justify="flex-end"
        mr={-Spacing.two}
      >
        {pendingEdit?.status === "failed" ? (
          <Text color="error" fontSize={11}>
            {pendingEdit.lastError === "offline" ? "Keine Verbindung" : "Speichern fehlgeschlagen"}
          </Text>
        ) : pendingEdit ? (
          <Text color="textSecondary" fontSize={11}>wird gespeichert…</Text>
        ) : edited && (
          <Text color="textSecondary" fontSize={11}>bearbeitet</Text>
        )}
        <Text color="textSecondary" fontSize={11} self="flex-end">
          {formatClock(message.sentAt ?? message.receivedAt)}
        </Text>
        {isOwn && <Check color="textSecondary" size={12} />}
      </XStack>
      {pendingEdit?.status === "failed" && (
        <Button py={Spacing.one} px={Spacing.two} self="flex-end" onPress={onRetryEdit}>
          Erneut versuchen
        </Button>
      )}
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
  onOpenMenu,
}: Readonly<{
  row: OutboxRow;
  isGroupStart: boolean;
  isNewest: boolean;
  onDiscard: (row: OutboxRow) => void;
  onOpenMenu: (row: OutboxRow) => void;
}>) {
  return (
    <Bubble
      onLongPress={() => onOpenMenu(row)}
      accessibilityActions={[{ name: "longpress", label: "Nachrichtenoptionen" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") onOpenMenu(row);
      }}
      isOwn
      isGroupStart={isGroupStart}
      isNewest={isNewest}
      borderTopLeftRadius={8}
      borderTopRightRadius={isGroupStart ? 0 : 8}
      borderBottomLeftRadius={8}
      borderBottomRightRadius={8}
      backgroundColor="backgroundSelected"
    >
      <MessageMarkdown text={row.text ?? ""} />

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
          {formatClock(row.createdAt)}
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

function SystemMessageRow({ text }: { text: string }) {
  return (
    <YStack w="100%" px={Spacing.three} my={Spacing.two} items="center">
      <YStack
        maxW="90%"
        gap={Spacing.one}
        rounded={Spacing.two}
        px={Spacing.three}
        py={Spacing.two}
        backgroundColor="backgroundSecondary"
        color="textSecondary"
      >
        <Text fontSize={12}>
          {text}
        </Text>
      </YStack>
    </YStack>
  )
}

type PendingEdit = OutboxRow & { editText: string };

type ListEntry =
  | { kind: "message"; message: RawMessage }
  | { kind: "pending"; row: OutboxRow }
  | { kind: "day"; text: string };

export default function ChatScreen() {
  const { chatId: chatIdParam, messageId } = useLocalSearchParams<{ chatId: string; messageId?: string }>();
  const chatId = Number(chatIdParam);
  const target = Number(messageId);
  const initialTargetId = Number.isSafeInteger(target) && target > 0 ? target : null;
  const session = useSession();
  if (session.status !== "signed_in") return null;
  return <ChatContent key={`${session.account.id}:${chatId}:${initialTargetId ?? "latest"}`} chatId={chatId}
    accountId={session.account.id} currentUserId={session.account.userid} initialTargetId={initialTargetId} />;
}

function ChatContent({ chatId, accountId, currentUserId, initialTargetId }: Readonly<{
  chatId: number;
  accountId: string;
  currentUserId: string;
  initialTargetId: number | null;
}>) {
  const { chat } = useChat(chatId);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const searching = searchQuery.trim().length > 0;
  const searchResult = useMessageSearch(accountId, searchQuery, { chatId });
  const searchCount = searchResult?.hits.length;
  const activeIndex = Math.min(searchIndex, Math.max(0, (searchCount ?? 0) - 1));
  const activeTargetId = (searching ? searchResult?.hits[activeIndex]?.message.id : undefined) ?? targetId;
  const { messages, loading, loadOlder } = useMessages(chatId, { targetId: activeTargetId });
  const { pending, sending, send, discard } = useOutbox(chatId);
  const messageEdit = useMessageEdit(chatId);
  const { start: startEditMode, cancel: cancelEditMode } = messageEdit;
  const [menuRow, setMenuRow] = useState<OutboxRow | null>(null);
  const [text, setText] = useState("");
  const inputRef = useRef<TamaguiElement>(null);
  const [selection, setSelection] = useState<MessageSelection>();
  const [restoredSelection, setRestoredSelection] = useState<MessageSelection>();
  const [error, setError] = useState<string>();
  const [inputHeight, setInputHeight] = useState(44);
  const [discardRow, setDiscardRow] = useState<OutboxRow | null>(null);
  const [tagsByMessage, setTagsByMessage] = useState<ChatMessageTags>();
  const [tagsLoadFailed, setTagsLoadFailed] = useState(false);
  const [reactions, setReactions] = useState<ChatMessageReactions>({});
  const [reactionError, setReactionError] = useState<string>();
  const [quote, setQuote] = useState<ReturnType<typeof replyPreview> | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [menuMessage, setMenuMessage] = useState<RawMessage | null>(null);
  const { profiles } = useProfiles();
  const { members } = useChatMembers(chatId);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let cancelled = false;
    void messageTagsStore.list(accountId, chatId).then((tags) => {
      if (!cancelled) setTagsByMessage(tags);
    }).catch(() => {
      if (!cancelled) setTagsLoadFailed(true);
    });
    void messageReactionsStore.list(accountId, chatId).then((stored) => {
      if (!cancelled) setReactions(stored);
    }).catch(() => {
      if (!cancelled) setReactionError("Reaktionen konnten nicht geladen werden.");
    });
    return () => { cancelled = true; };
  }, [accountId, chatId]);

  const chatTags = useMemo(() => [...new Set(Object.values(tagsByMessage ?? {}).flat())]
    .sort((a, b) => a.localeCompare(b, "de")), [tagsByMessage]);
  const taggedIds = useMemo(() => searching || selectedTag === null ? null : Object.entries(tagsByMessage ?? {})
    .filter(([, tags]) => tags.includes(selectedTag))
    .map(([id]) => Number(id))
    .sort((a, b) => b - a), [searching, selectedTag, tagsByMessage]);
  const taggedResult = useTaggedMessages(chatId, taggedIds);

  const startReply = useCallback((message: RawMessage) => {
    setQuote(replyPreview(message, currentUserId));
    setEditingMessageId(null);
    cancelEditMode();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [currentUserId, cancelEditMode]);

  // ADR-006: edit messages are hidden; originals show the newest text and "bearbeitet".
  const shown = useMemo(() => applyMessageEdits(messages), [messages]);
  const pendingEdits = useMemo(() => pendingEditsByTarget(pending), [pending]);

  const startEdit = useCallback((next: EditTarget) => {
    startEditMode(next);
    setText(next.text);
    setQuote(null);
    setEditingMessageId(null);
    setSelection(undefined);
    setRestoredSelection(undefined);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [startEditMode]);

  const editMessage = useCallback((message: RawMessage) => {
    startEdit({ kind: "sent", id: message.id, text: pendingEdits.get(message.id)?.editText ?? message.text ?? "" });
  }, [startEdit, pendingEdits]);

  const retryEdits = useCallback(() => syncRuntime.flushOutbox(chatId), [chatId]);

  const reactToMessage = useCallback((id: number, emoji: string) => {
    setReactionError(undefined);
    void messageReactionsStore.toggle(accountId, chatId, id, emoji).then(setReactions).catch(() => {
      setReactionError("Reaktion konnte nicht gespeichert werden.");
    });
  }, [accountId, chatId]);

  // `messages` is newest-first (for the inverted list); `pending` is oldest-first (the
  // repository's contract). Pending rows are always newer than any confirmed message, so they
  // go first in the combined, newest-first array — reversed, so the most recently typed
  // message renders closest to the input box at the bottom of the inverted list.
  const entries = useMemo<ListEntry[]>(() => {
    const combined: ListEntry[] = taggedIds !== null
      ? (taggedResult?.messages ?? []).map((message) => ({ kind: "message", message }))
      : [
          ...(activeTargetId === null ? pending.filter((row) => !isEditMessageText(row.text)) : [])
            .reverse()
            .map((row): ListEntry => ({ kind: "pending", row })),
          ...shown.messages.map((message): ListEntry => ({ kind: "message", message })),
        ];

    const withSeparators: ListEntry[] = [];

    combined.forEach((entry, index) => {
      const time = getTimestamp(entry);
      const olderEntry = combined[index + 1];
      const olderTime = getTimestamp(olderEntry);

      // Push the entry first, so that the day separator appears *after* the last message of the
      // previous day, and before the first message of the new day. (list is inverted, so the
      // "first" message is the newest one, at the bottom of the list.)
      withSeparators.push(entry);

      if (
        time !== undefined &&
        (olderTime === undefined ||
          new Date(time).toDateString() !== new Date(olderTime).toDateString())
      ) {
        withSeparators.push({
          kind: "day",
          text: new Date(time).toLocaleDateString(),
        });
      }

    });

    return withSeparators;
  }, [shown, pending, taggedIds, taggedResult, activeTargetId]);

  const renderItem = useCallback(
    ({ item, index }: { item: ListEntry; index: number }) => {
      const prev = entries[index + 1];
      const previousAuthor = getAuthorId(prev, currentUserId);
      const prevTime = getTimestamp(prev);
      const time = getTimestamp(item);

      if (item.kind === "day") {
        return <SystemMessageRow text={item.text} />;
      }

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
            onOpenMenu={setMenuRow}
          />
        );

      return (
        <MessageRow
          message={item.message}
          isOwn={item.message.userid === currentUserId}
          isGroupStart={isGroupStart}
          isNewest={isNewest}
          tags={tagsByMessage?.[item.message.id] ?? NO_TAGS}
          onOpenMenu={setMenuMessage}
          onEditTags={tagsByMessage ? setEditingMessageId : undefined}
          reaction={reactions[item.message.id]}
          onReact={reactToMessage}
          onReply={startReply}
          highlighted={item.message.id === activeTargetId}
          edited={shown.editedIds.has(item.message.id)}
          pendingEdit={pendingEdits.get(item.message.id)}
          onEdit={canEditMessage(item.message, currentUserId) ? editMessage : undefined}
          onRetryEdit={retryEdits}
        />
      );
    },
    [entries, currentUserId, tagsByMessage, activeTargetId, reactions, reactToMessage, startReply,
      shown, pendingEdits, editMessage, retryEdits],
  );

  const canSend = (messageEdit.target ? isEditChange(messageEdit.target.text, text) : text.trim().length > 0)
    && !sending && !messageEdit.saving;
  const selectedText = selection ? text.slice(selection.start, selection.end).trim() : "";
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
    if (messageEdit.target) {
      if (await messageEdit.save(text)) {
        setText("");
        setSelection(undefined);
        setRestoredSelection(undefined);
      }
      return;
    }
    const toSend = replyText(text, quote);
    setError(undefined);
    try {
      await send(toSend);
      setSelectedTag(null);
      setTargetId(null);
      setText("");
      setQuote((current) => current === quote ? null : current);
      setSelection(undefined);
      setRestoredSelection(undefined);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Senden fehlgeschlagen.",
      );
    }
  }

  function handleFormat(format: MessageFormat) {
    if (!selection) return;
    const edit = formatMessageSelection(text, selection, format);
    if (!edit) return;

    inputRef.current?.focus();
    setText(edit.text);
    setSelection(edit.selection);
    setRestoredSelection(edit.selection);
  }

  function updateSelection(range: MessageSelection) {
    setSelection(range.start === range.end ? undefined : range);
    setRestoredSelection(undefined);
  }

  function syncBrowserSelection() {
    const input = inputRef.current;
    // The browser's select event can omit a change from a range to a caret.
    if (input && "selectionStart" in input && "selectionEnd" in input &&
      typeof input.selectionStart === "number" && typeof input.selectionEnd === "number") {
      updateSelection({ start: input.selectionStart, end: input.selectionEnd });
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
      <MessageSearchInput value={searchQuery} onChange={(value) => {
        setSearchQuery(value);
        setSearchIndex(0);
      }} chatOnly />
      {searching && (
        <ChatSearchNavigation count={searchCount} index={activeIndex} error={searchResult?.error}
          onNavigate={setSearchIndex} />
      )}
      {!searching && chatTags.length > 0 && (
        <MessageTagFilter tags={chatTags} selected={selectedTag} onSelect={(tag) => {
          setTargetId(null);
          setSelectedTag(tag);
        }} />
      )}
      {tagsLoadFailed && <Text color="error" px={Spacing.three}>Tags konnten nicht geladen werden.</Text>}
      {reactionError && <Text color="error" px={Spacing.three}>{reactionError}</Text>}
      {!searching && targetId !== null && (
        <YStack px={Spacing.three} pb={Spacing.two} gap={Spacing.one}>
          <Button size="sm" self="flex-start" onPress={() => setTargetId(null)}>Zu den neuesten Nachrichten</Button>
          {!loading && !messages.some(({ id }) => id === targetId) && (
            <Text color="textSecondary">Diese Nachricht ist lokal nicht verfügbar.</Text>
          )}
        </YStack>
      )}
      {(taggedIds !== null ? !taggedResult : loading) ? (
        <YStack flex={1} items="center" justify="center">
          <Spinner size="large" color="accent" />
        </YStack>
      ) : (
        <FlatList
          key={activeTargetId ?? "latest"}
          data={entries}
          keyExtractor={(entry) =>
            entry.kind === "day"
              ? `day-${entry.text}`
              : entry.kind === "message"
                ? `m-${entry.message.id}`
                : `p-${entry.row.clientMessageId}`
          }
          renderItem={renderItem}
          ListEmptyComponent={taggedIds === null ? undefined : (
            <Text color={taggedResult?.error ? "error" : "textSecondary"} px={Spacing.three} py={Spacing.two}>
              {taggedResult?.error ? "Markierte Nachrichten konnten nicht geladen werden." : "Keine gespeicherten Nachrichten mit diesem Tag."}
            </Text>
          )}
          inverted
          // `entries` is newest-first; `inverted` renders index 0 at the bottom (newest), so the
          // list's "end" (its last data item) is the oldest loaded message, rendered at the top —
          // exactly where more history should be fetched from.
          onEndReached={() => {
            if (taggedIds === null) void loadOlder();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
      {!searching && <KeyboardAvoidingView behavior="padding">
        {editingMessageId !== null && (
          <MessageTagEditor key={editingMessageId} initialTags={tagsByMessage?.[editingMessageId] ?? NO_TAGS}
            availableTags={chatTags}
            onCancel={() => setEditingMessageId(null)}
            onSave={async (tags) => {
              const updated = await messageTagsStore.set(accountId, chatId, editingMessageId, tags);
              setTagsByMessage(updated);
              setSelectedTag((current) => current !== null && Object.values(updated).some((values) => values.includes(current)) ? current : null);
              setEditingMessageId((current) => current === editingMessageId ? null : current);
            }} />
        )}
        <YStack
          display={editingMessageId === null ? "flex" : "none"}
          gap={Spacing.one}
          px={Spacing.three}
          py={Spacing.three}
        >
          {messageEdit.target && (
            <EditMessageBanner originalText={messageEdit.target.text} error={messageEdit.error}
              saving={messageEdit.saving} onRetry={() => void handleSend()}
              onCancel={() => {
                cancelEditMode();
                setText("");
              }} />
          )}
          {quote && (
            <XStack items="center" gap={Spacing.two} backgroundColor="backgroundElement"
              borderLeftWidth={2} borderLeftColor="accent" px={Spacing.two} py={Spacing.one}>
              <YStack flex={1} minW={0}>
                <Text color="text" fontWeight="700">Antwort an {quote.author}</Text>
                <Text color="textSecondary" numberOfLines={2}>{quote.text}</Text>
              </YStack>
              <Button size="sm" variant="quiet" aria-label="Zitat entfernen" onPress={() => setQuote(null)}>×</Button>
            </XStack>
          )}
          <XStack gap={Spacing.two} items="flex-end">
            <TextArea
              ref={inputRef}
              flex={1}
              value={text}
              onChangeText={(value) => {
                setText(value);
                setSelection(undefined);
                setRestoredSelection(undefined);
              }}
              selection={restoredSelection}
              onSelectionChange={({ nativeEvent }) => updateSelection(nativeEvent.selection)}
              onKeyUp={syncBrowserSelection}
              onClick={syncBrowserSelection}
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

          {!!selectedText && (
            <XStack role="group" aria-label="Text formatieren" gap={Spacing.two}>
              <Button
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onPress={() => handleFormat("bold")}
              >
                <Text color="text" fontWeight="700">Fett</Text>
              </Button>
              <Button
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onPress={() => handleFormat("italic")}
              >
                <Text color="text" fontStyle="italic">Kursiv</Text>
              </Button>
              {!selectedText.includes("\n") && (
                <Button
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onPress={() => handleFormat("code")}
                >
                  <Text color="text" fontFamily="mono">Code</Text>
                </Button>
              )}
            </XStack>
          )}

          {!!error && <Text color="error">{error}</Text>}
        </YStack>
      </KeyboardAvoidingView>}
      <ConfirmDialog
        visible={menuMessage !== null}
        title="Nachrichtenoptionen"
        message="Reaktionen bleiben auf diesem Gerät."
        confirmLabel="Tags bearbeiten"
        cancelLabel="Schließen"
        destructive={false}
        onConfirm={() => {
          if (menuMessage) setEditingMessageId(menuMessage.id);
          setMenuMessage(null);
        }}
        onCancel={() => setMenuMessage(null)}
      >
        <MessageReactionPicker selected={menuMessage ? reactions[menuMessage.id] : undefined} onSelect={(emoji) => {
          if (menuMessage) reactToMessage(menuMessage.id, emoji);
          setMenuMessage(null);
        }} />
        <Button size="sm" variant="quiet" onPress={() => {
          if (menuMessage) startReply(menuMessage);
          setMenuMessage(null);
        }}>Antworten</Button>
        {menuMessage && canEditMessage(menuMessage, currentUserId) && (
          <Button size="sm" variant="quiet" onPress={() => {
            editMessage(menuMessage);
            setMenuMessage(null);
          }}>Nachricht bearbeiten</Button>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        visible={menuRow !== null}
        title="Nachrichtenoptionen"
        message="Diese Nachricht ist noch nicht gesendet."
        confirmLabel="Nachricht bearbeiten"
        cancelLabel="Abbrechen"
        destructive={false}
        onConfirm={() => {
          if (menuRow) {
            startEdit({ kind: "pending", clientMessageId: menuRow.clientMessageId, text: menuRow.text ?? "" });
          }
          setMenuRow(null);
        }}
        onCancel={() => setMenuRow(null)}
      />
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
