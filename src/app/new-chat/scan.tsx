import { Text, YStack } from "tamagui";

import Header from "@/components/header";
import { Spacing } from "@/config/layout";

export default function ScanScreen() {
  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="QR-Code scannen" />
      <YStack px={Spacing.four}>
        <Text color="textSecondary">Demnächst verfügbar</Text>
      </YStack>
    </YStack>
  );
}
