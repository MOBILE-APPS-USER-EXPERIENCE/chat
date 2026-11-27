import { router } from "expo-router";
import { useState } from "react";
import { Button, Input, Label, Spinner, Text, YStack } from "tamagui";

import Header from "@/components/header";
import { FontSize, Spacing } from "@/config/layout";
import { useLearningStatus } from "@/hooks/use-learning-status";
import { useSyncStatus } from "@/hooks/use-study-rooms";
import { syncRuntime } from "@/messaging/runtime";
import { describeChatActionError } from "@/utils/chat-actions";
import type { LearningStatus } from "@/utils/learning-status";
import {
  buildStudyRoomName,
  EXAM_LABEL,
  parseExamNumber,
  stripStudyRoomPrefix,
  studyRoomInputError,
} from "@/utils/study-room-name";

function ReadOnlyValue({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <YStack gap={Spacing.one}>
      <Text color="textSecondary" fontSize={FontSize.small}>
        {label}
      </Text>
      <Text color="text" fontSize={FontSize.standard}>
        {value}
      </Text>
    </YStack>
  );
}

function CreateRoomForm({ status }: Readonly<{ status: LearningStatus }>) {
  const [examInput, setExamInput] = useState("");
  const [examTouched, setExamTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { offline } = useSyncStatus();

  const examNumber = parseExamNumber(examInput);
  const validation = studyRoomInputError({
    examNumber: examInput,
    module: status.module,
    progress: status.progress,
  });
  const showValidation = validation !== null && examTouched;
  const name = buildStudyRoomName({ examNumber, module: status.module, progress: status.progress });

  async function handleCreate() {
    if (validation !== null || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await syncRuntime.createGroup({ name, isPublic: true });
      if (result.refreshed) {
        router.replace({
          pathname: "/chat/[chatId]",
          params: { chatId: String(result.chatId) },
        });
      } else {
        // Same as "Gruppe erstellen": the chat list could not be refreshed yet, so the new
        // chat is not stored locally. Go back; it appears with the next sync.
        router.back();
      }
    } catch (caughtError) {
      setError(describeChatActionError(caughtError, "create"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack px={Spacing.four} gap={Spacing.four}>
      <ReadOnlyValue label="Modul" value={status.module} />
      <ReadOnlyValue label="Stand" value={status.progress} />
      <Text color="textSecondary" fontSize={FontSize.small}>
        Modul und Stand kommen aus deinem Lernstatus.
      </Text>

      <YStack gap={Spacing.two}>
        <Label htmlFor="exam-number">{EXAM_LABEL} Nr. (optional)</Label>
        <Input
          id="exam-number"
          value={examInput}
          onChangeText={(text) => {
            setExamInput(text);
            setExamTouched(true);
          }}
          onBlur={() => setExamTouched(true)}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="z. B. 3"
          borderColor={showValidation ? "error" : "backgroundSelected"}
          color="text"
          placeholderTextColor="textSecondary"
          h={Spacing.inputHeight}
          disabled={busy}
        />
        {showValidation && (
          <Text color="error" fontSize={FontSize.small}>
            {validation}
          </Text>
        )}
      </YStack>

      <ReadOnlyValue label="Name des Lernraums" value={stripStudyRoomPrefix(name)} />
      <Text color="textSecondary" fontSize={FontSize.small}>
        Der Lernraum ist ein öffentlicher Gruppenchat. Alle mit Lernstatus in{" "}
        {status.module} sehen ihn mit deinem Stand und entscheiden selbst, ob sie
        beitreten.
      </Text>

      {offline && (
        <Text color="textSecondary" fontSize={FontSize.small}>
          Du bist offline. Erstellen geht nur online.
        </Text>
      )}

      {!!error && (
        <YStack gap={Spacing.two}>
          <Text color="error">{error}</Text>
          <Button
            h={Spacing.inputHeight}
            disabled={busy || offline}
            onPress={() => void handleCreate()}
          >
            Erneut versuchen
          </Button>
        </YStack>
      )}

      <Button
        h={Spacing.inputHeight}
        disabled={validation !== null || busy || offline}
        onPress={() => void handleCreate()}
      >
        {busy ? <Spinner color="text" /> : "Lernraum erstellen"}
      </Button>
    </YStack>
  );
}

export default function CreateStudyRoomScreen() {
  const { status, loading, error } = useLearningStatus();

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Lernraum erstellen" />
      {loading ? (
        <YStack flex={1} items="center" justify="center">
          <Spinner size="large" color="accent" />
        </YStack>
      ) : status === null ? (
        <YStack px={Spacing.four} gap={Spacing.three}>
          <Text color={error ? "error" : "text"}>
            {error ?? "Setze zuerst deinen Lernstatus."}
          </Text>
          <Button
            h={Spacing.inputHeight}
            onPress={() => router.replace("/exam-phase/learning-status")}
          >
            Lernstatus setzen
          </Button>
        </YStack>
      ) : (
        <CreateRoomForm status={status} />
      )}
    </YStack>
  );
}
