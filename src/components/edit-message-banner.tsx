import { Button, Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";

/** "Nachricht bearbeiten" above the composer. Same style as the existing reply preview. */
export default function EditMessageBanner({
  originalText,
  error,
  saving,
  onRetry,
  onCancel,
}: Readonly<{
  originalText: string;
  error?: string;
  saving: boolean;
  onRetry: () => void;
  onCancel: () => void;
}>) {
  return (
    <YStack gap={Spacing.one}>
      <XStack
        items="center"
        gap={Spacing.two}
        backgroundColor="backgroundElement"
        borderLeftWidth={2}
        borderLeftColor="accent"
        px={Spacing.two}
        py={Spacing.one}
      >
        <YStack flex={1} minW={0}>
          <Text color="text" fontWeight="700">
            {saving ? "Wird gespeichert…" : "Nachricht bearbeiten"}
          </Text>
          <Text color="textSecondary" numberOfLines={2}>
            {originalText}
          </Text>
        </YStack>
        <Button
          size="sm"
          variant="quiet"
          aria-label="Bearbeiten abbrechen"
          disabled={saving}
          onPress={onCancel}
        >
          ×
        </Button>
      </XStack>
      {!!error && (
        <XStack items="center" gap={Spacing.two}>
          <Text flex={1} color="error">
            {error}
          </Text>
          <Button size="sm" onPress={onRetry} disabled={saving}>
            Erneut versuchen
          </Button>
        </XStack>
      )}
    </YStack>
  );
}
