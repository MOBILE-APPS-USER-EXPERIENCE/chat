import { Button, Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";

const REACTIONS = [
  ["👍", "Gefällt mir"], ["❤️", "Herz"], ["😂", "Lachen"],
  ["😮", "Überrascht"], ["😢", "Traurig"], ["🙏", "Danke"],
] as const;

export function reactionLabel(emoji: string) {
  return REACTIONS.find(([value]) => value === emoji)?.[1] ?? emoji;
}

export default function MessageReactionPicker({ selected, onSelect }: Readonly<{
  selected?: string;
  onSelect: (emoji: string) => void;
}>) {
  return (
    <YStack gap={Spacing.one}>
      <XStack role="group" aria-label="Emoji-Reaktion auswählen" gap={Spacing.one} flexWrap="wrap">
        {REACTIONS.map(([emoji, label]) => (
          <Button key={emoji} size="sm" px={Spacing.two} aria-label={label} aria-pressed={selected === emoji}
            backgroundColor={selected === emoji ? "backgroundSelected" : "backgroundElement"}
            onPress={() => onSelect(emoji)}>
            <Text fontSize={18}>{emoji}</Text>
          </Button>
        ))}
      </XStack>
    </YStack>
  );
}
