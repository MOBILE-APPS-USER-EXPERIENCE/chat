import { SectionList } from "react-native";
import { Button, Input, Spinner, Text, XStack, YStack } from "tamagui";

import Avatar from "@/components/avatar";
import { ChevronLeft } from "@/components/icons";
import { Spacing } from "@/config/layout";
import { useChatMembers } from "@/hooks/use-chat-members";
import { useMessageSearch, type ChatSearchHit } from "@/hooks/use-message-search";
import type { MessageSearchHit } from "@/storage/searchMessages";
import type { ChatRow, ProfileRow } from "@/storage/types";
import { chatDisplayName } from "@/utils/chat-actions";
import { splitSearchMatches } from "@/utils/search-text";

export function MessageSearchInput({ value, onChange, chatOnly }: Readonly<{
  value: string;
  onChange: (value: string) => void;
  chatOnly?: boolean;
}>) {
  const label = chatOnly ? "Nachrichten oder Tags in diesem Chat suchen" : "Chats, Nachrichten oder Tags suchen";
  return (
    <XStack px={Spacing.three} pb={Spacing.two} gap={Spacing.two} items="center">
      <XStack flex={1} items="center" backgroundColor="backgroundElement" rounded={Spacing.three} px={Spacing.two}>
        <Input flex={1} minW={0} borderWidth={0} value={value} onChangeText={onChange} aria-label={label}
          placeholder={chatOnly ? "Im Chat suchen" : "Chats, Nachrichten oder Tags suchen"}
          color="text" placeholderTextColor="textSecondary" backgroundColor="transparent" />
        {value.length > 0 && (
          <Button variant="quiet" circular size="sm" aria-label="Suche leeren" onPress={() => onChange("")}>×</Button>
        )}
      </XStack>
    </XStack>
  );
}

type SearchRow = { kind: "chat"; hit: ChatSearchHit } | { kind: "message"; hit: MessageSearchHit };

export function MessageSearchResults({ accountId, query, profiles, selfUserid, onSelect, onSelectChat }: Readonly<{
  accountId?: string;
  query: string;
  profiles: ProfileRow[];
  selfUserid: string;
  onSelect: (hit: MessageSearchHit) => void;
  onSelectChat: (chat: ChatRow) => void;
}>) {
  const result = useMessageSearch(accountId, query, { profiles, selfUserid });
  if (!result) return <YStack flex={1} items="center" justify="center"><Spinner color="accent" /></YStack>;

  const sections = [
    { title: "Chats", data: result.chats.map((hit): SearchRow => ({ kind: "chat", hit })) },
    { title: "Nachrichten", data: result.hits.map((hit): SearchRow => ({ kind: "message", hit })) },
  ].filter(({ data }) => data.length > 0);

  return (
    <SectionList
      sections={sections}
      stickySectionHeadersEnabled={false}
      keyExtractor={(item) => item.kind === "chat" ? `chat:${item.hit.chat.id}` : `message:${item.hit.chat.id}:${item.hit.message.id}`}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={(
        <Text color={result.error ? "error" : "textSecondary"} px={Spacing.three} py={Spacing.two}>
          {result.error ? "Die Suche konnte nicht geladen werden." : "Keine passenden Chats oder Nachrichten gefunden."}
        </Text>
      )}
      renderSectionHeader={({ section }) => (
        <Text role="heading" px={Spacing.three} pt={Spacing.two} pb={Spacing.one} fontWeight="700" color="textSecondary">
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => item.kind === "chat" ? (
        <Button variant="quiet" h="auto" justify="flex-start" px={Spacing.three} py={Spacing.two}
          onPress={() => onSelectChat(item.hit.chat)}>
          <XStack gap={Spacing.two} items="center" flex={1} minW={0}>
            <Avatar label={`Avatar für ${item.hit.name}`} placeholder={item.hit.name[0]?.toUpperCase() ?? "?"} />
            <Text color="text" fontWeight="700" shrink={1}><SearchMatch value={item.hit.name} query={query} /></Text>
          </XStack>
        </Button>
      ) : <MessageSearchRow hit={item.hit} query={query} profiles={profiles} selfUserid={selfUserid} onSelect={onSelect} />}
    />
  );
}

function SearchMatch({ value, query }: Readonly<{ value: string; query: string }>) {
  return splitSearchMatches(value, query).map(({ text, match }, index) => match ? (
    <Text key={index} color="text" fontWeight="700" backgroundColor="backgroundSelected">{text}</Text>
  ) : text);
}

function MessageSearchRow({ hit, query, profiles, selfUserid, onSelect }: Readonly<{
  hit: MessageSearchHit;
  profiles: ProfileRow[];
  selfUserid: string;
  query: string;
  onSelect: (hit: MessageSearchHit) => void;
}>) {
  const { chat, message, tags } = hit;
  const { members } = useChatMembers(chat.id, chat.directchat);
  const name = chatDisplayName({ chat, members, profiles, selfUserid });
  const body = message.text?.trim() || (message.photoId ? "Foto" : message.fileId ? "Datei" : "Nachricht");
  const sender = message.userid.toLowerCase() === selfUserid.toLowerCase()
    ? "Du"
    : message.userNick?.trim() || message.userFullname?.trim() || message.userid;
  const date = new Date(message.sentAt ?? message.receivedAt).toLocaleDateString("de-DE");

  return (
    <Button variant="quiet" h="auto" justify="flex-start" px={Spacing.three} py={Spacing.two}
      onPress={() => onSelect(hit)}>
      <YStack flex={1} minW={0} maxW={720} gap={Spacing.one}>
        <XStack gap={Spacing.two} justify="space-between">
          <Text fontWeight="700" color="text" shrink={1} numberOfLines={1}><SearchMatch value={name} query={query} /></Text>
          <Text color="textSecondary">{date}</Text>
        </XStack>
        <YStack backgroundColor="backgroundElement" borderLeftWidth={2} borderLeftColor="backgroundSelected"
          rounded={Spacing.two} px={Spacing.two} py={Spacing.two} gap={Spacing.one}>
          <Text color="textSecondary" fontSize={12} text="left">{sender}</Text>
          <Text color="text" text="left" whiteSpace="pre-wrap" overflowWrap="anywhere">
            <SearchMatch value={body} query={query} />
          </Text>
        </YStack>
        {tags.length > 0 && <Text color="textSecondary" text="left"><SearchMatch value={tags.join(" · ")} query={query} /></Text>}
      </YStack>
    </Button>
  );
}

export function ChatSearchNavigation({ count, index, error, onNavigate }: Readonly<{
  count?: number;
  index: number;
  error?: boolean;
  onNavigate: (index: number) => void;
}>) {
  return (
    <XStack px={Spacing.three} pb={Spacing.two} items="center" gap={Spacing.one}>
      <Text flex={1} color={error ? "error" : "textSecondary"} aria-live="polite">
        {error ? "Die Suche konnte nicht geladen werden." : count === undefined ? "Suche …"
          : count > 0 ? `Treffer ${index + 1} von ${count}` : "Keine passenden Nachrichten gefunden."}
      </Text>
      {!!count && (
        <>
          <Button size="sm" circular variant="quiet" disabled={index >= count - 1} aria-label="Älterer Treffer"
            onPress={() => onNavigate(index + 1)}><XStack rotate="90deg"><ChevronLeft color="text" size={16} /></XStack></Button>
          <Button size="sm" circular variant="quiet" disabled={index === 0} aria-label="Neuerer Treffer"
            onPress={() => onNavigate(index - 1)}><XStack rotate="-90deg"><ChevronLeft color="text" size={16} /></XStack></Button>
        </>
      )}
    </XStack>
  );
}
