import { router } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { Button, Separator, Spinner, Text, XStack, YStack } from "tamagui";

import { FontSize, Spacing } from "@/config/layout";
import { useStudyRooms, useSyncStatus } from "@/hooks/use-study-rooms";
import { syncRuntime } from "@/messaging/runtime";
import { describeChatActionError } from "@/utils/chat-actions";
import type { LearningStatus } from "@/utils/learning-status";
import type { StudyRoom } from "@/utils/study-rooms";

function openChat(chatId: number) {
  router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chatId) } });
}

function openCreateRoom() {
  router.push("/exam-phase/create-room");
}

function StudyRoomRow({
  room,
  offline,
}: Readonly<{ room: StudyRoom; offline: boolean }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setBusy(true);
    setError(undefined);
    try {
      await syncRuntime.joinChat(room.chat.id);
      openChat(room.chat.id);
    } catch (caughtError) {
      setError(describeChatActionError(caughtError, "join"));
    } finally {
      setBusy(false);
    }
  }

  // Rooms for a sample exam use the same card style as the other cards on this screen,
  // general study rooms stay a plain list row.
  const isExamRoom = room.info.examNumber !== null;

  return (
    <YStack
      gap={Spacing.one}
      py={Spacing.three}
      px={isExamRoom ? Spacing.three : 0}
      my={isExamRoom ? Spacing.one : 0}
      rounded={isExamRoom ? Spacing.two : 0}
      backgroundColor={isExamRoom ? "backgroundElement" : "background"}
    >
      <XStack gap={Spacing.two} items="center" justify="space-between">
        <YStack flex={1} gap={Spacing.one}>
          <Text
            color={isExamRoom ? "accent" : "textSecondary"}
            fontSize={FontSize.small}
            fontWeight="600"
          >
            {isExamRoom ? "Prüfungsvorbereitung" : "Lernraum"}
          </Text>
          {isExamRoom && (
            <Text fontWeight="600" color="text">
              {room.title}
            </Text>
          )}
          <Text color="textSecondary" fontSize={FontSize.medium}>
            {room.info.module} · Stand: {room.info.progress}
          </Text>
          {room.sameProgress && (
            <Text color="accent" fontSize={FontSize.small} fontWeight="600">
              Gleicher Stand wie du
            </Text>
          )}
        </YStack>
        {room.chat.joined ? (
          <Button h={Spacing.inputHeight} onPress={() => openChat(room.chat.id)}>
            Öffnen
          </Button>
        ) : (
          <Button
            h={Spacing.inputHeight}
            disabled={busy || offline}
            onPress={() => void join()}
          >
            {busy ? <Spinner color="text" /> : "Beitreten"}
          </Button>
        )}
      </XStack>
      {!!error && (
        <YStack gap={Spacing.two}>
          <Text color="error">{error}</Text>
          <Button
            self="flex-start"
            disabled={busy || offline}
            onPress={() => void join()}
          >
            Erneut versuchen
          </Button>
        </YStack>
      )}
    </YStack>
  );
}

function StudyRoomListBody({ status }: Readonly<{ status: LearningStatus }>) {
  const { rooms, loading, offline, storageError } = useStudyRooms(
    status.module,
    status.progress,
  );

  if (storageError) return null;
  if (loading) {
    return (
      <YStack flex={1} items="center" justify="center">
        <Spinner size="large" color="accent" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} gap={Spacing.two}>
      {offline && (
        <Text color="textSecondary" fontSize={FontSize.small}>
          Du bist offline. Die Liste zeigt den letzten Stand. Beitreten und
          Erstellen gehen nur online.
        </Text>
      )}
      {rooms.length === 0 ? (
        <YStack gap={Spacing.three} py={Spacing.three}>
          <Text color="textSecondary">
            Noch kein Lernraum für {status.module}. Erstell den ersten!
          </Text>
          <Button
            h={Spacing.inputHeight}
            disabled={offline}
            onPress={openCreateRoom}
          >
            Lernraum erstellen
          </Button>
        </YStack>
      ) : (
        <>
          <FlatList
            data={rooms}
            keyExtractor={(room) => String(room.chat.id)}
            renderItem={({ item }) => (
              <StudyRoomRow room={item} offline={offline} />
            )}
            ItemSeparatorComponent={<Separator borderColor="backgroundSelected" />}
          />
          <Button
            h={Spacing.inputHeight}
            disabled={offline}
            onPress={openCreateRoom}
          >
            Lernraum erstellen
          </Button>
        </>
      )}
    </YStack>
  );
}

/** "Lernräume für <Modul>" below the learning status card. */
export default function StudyRoomSection({
  status,
}: Readonly<{ status: LearningStatus }>) {
  // Changing the key remounts the list, which reloads the chats from local storage.
  const [reloadKey, setReloadKey] = useState(0);
  const { storageError } = useSyncStatus();

  return (
    <YStack flex={1} gap={Spacing.two}>
      <Text color="text" fontWeight="600" fontSize={FontSize.large}>
        Lernräume für {status.module}
      </Text>
      <Text color="textSecondary" fontSize={FontSize.small}>
        Lernräume sind öffentliche Gruppenchats. Jede Person kann sie finden und
        beitreten.
      </Text>
      {storageError && (
        <YStack gap={Spacing.two}>
          <Text color="error">Lernräume konnten nicht geladen werden</Text>
          <Button
            self="flex-start"
            onPress={() => setReloadKey((key) => key + 1)}
          >
            Erneut versuchen
          </Button>
        </YStack>
      )}
      <StudyRoomListBody key={reloadKey} status={status} />
    </YStack>
  );
}
