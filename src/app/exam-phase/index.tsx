import { router } from "expo-router";
import { Button, Spinner, Text, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import { FontSize, Spacing } from "@/config/layout";
import { useLearningStatus } from "@/hooks/use-learning-status";
import {
  studyProgramLabel,
  type LearningStatus,
} from "@/utils/learning-status";

function openLearningStatus() {
  router.push("/exam-phase/learning-status");
}

function StatusRow({ label, value }: Readonly<{ label: string; value: string }>) {
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

function MissingStatusCard() {
  return (
    <YStack
      backgroundColor="backgroundElement"
      rounded={Spacing.two}
      p={Spacing.three}
      gap={Spacing.three}
    >
      <Text color="text">
        Lernstatus fehlt – setze deinen Lernstatus, um Lernräume zu sehen.
      </Text>
      <Button h={Spacing.inputHeight} onPress={openLearningStatus}>
        Lernstatus setzen
      </Button>
    </YStack>
  );
}

function StatusCard({ status }: Readonly<{ status: LearningStatus }>) {
  return (
    <YStack
      backgroundColor="backgroundElement"
      rounded={Spacing.two}
      p={Spacing.three}
      gap={Spacing.three}
    >
      <XStack items="center" justify="space-between" gap={Spacing.two}>
        <Text color="text" fontWeight="600" fontSize={FontSize.large}>
          Dein Lernstatus
        </Text>
        <Button onPress={openLearningStatus}>Ändern</Button>
      </XStack>
      <StatusRow label="Studiengang" value={studyProgramLabel(status.studyProgram)} />
      <StatusRow label="Modul" value={status.module} />
      <StatusRow label="Stand" value={status.progress} />
    </YStack>
  );
}

export default function ExamPhaseScreen() {
  const { status, loading, error } = useLearningStatus();

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Prüfungsphase" />
      {loading ? (
        <YStack flex={1} items="center" justify="center">
          <Spinner size="large" color="accent" />
        </YStack>
      ) : (
        <YStack flex={1} px={Spacing.four} gap={Spacing.four}>
          {!!error && <Text color="error">{error}</Text>}
          {status === null ? (
            <MissingStatusCard />
          ) : (
            <StatusCard status={status} />
          )}
        </YStack>
      )}
    </YStack>
  );
}
