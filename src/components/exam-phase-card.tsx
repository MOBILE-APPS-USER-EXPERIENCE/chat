import { router } from "expo-router";
import { Button, Text, XStack, YStack } from "tamagui";

import { Users } from "@/components/icons";
import { FontSize, Spacing } from "@/config/layout";
import { useLearningStatus } from "@/hooks/use-learning-status";

/**
 * Entry card for "Prüfungsphase" on the chat list.
 * Shows whether a learning status is set; reloads whenever the chat tab gains focus.
 */
export default function ExamPhaseCard() {
  const { status, loading } = useLearningStatus();

  return (
    <Button
      justify="flex-start"
      h="auto"
      py={Spacing.three}
      mx={Spacing.two}
      rounded={Spacing.two}
      backgroundColor="backgroundElement"
      aria-label="Lernräume (Prüfungsphase) öffnen"
      onPress={() => router.push("/exam-phase")}
    >
      <XStack flex={1} items="center" gap={Spacing.three}>
        <Users color="text" />
        <YStack flex={1} items="flex-start" gap={Spacing.one}>
          <Text color="text" fontWeight="600" fontSize={FontSize.standard}>
            Lernräume (Prüfungsphase)
          </Text>
          <Text color="textSecondary" fontSize={FontSize.medium}>
            Mit Leuten auf deinem Stand lernen
          </Text>
          {!loading && (
            <Text
              color={status === null ? "accent" : "textSecondary"}
              fontSize={FontSize.small}
              fontWeight="600"
            >
              {status === null
                ? "Lernstatus fehlt"
                : `${status.module} · ${status.progress}`}
            </Text>
          )}
        </YStack>
      </XStack>
    </Button>
  );
}
