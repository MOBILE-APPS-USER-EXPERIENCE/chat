import { router } from "expo-router";
import { Button, Text, YStack } from "tamagui";

import Header from "@/components/header";
import { QrCode, User, Users } from "@/components/icons";
import { Spacing } from "@/config/layout";

export default function NewChatScreen() {
  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Neuer Chat" />
      <YStack mt={Spacing.two} px={Spacing.four} gap={Spacing.two} justify={"center"}>
        <Button
          justify="flex-start"
          onPress={() => router.push("/new-chat/group")}
          h={Spacing.inputHeight}
        >
          <Users color="text" />
          <Text color="text" fontWeight="600">Gruppe erstellen</Text>
        </Button>
        <Button
          justify="flex-start"
          onPress={() => router.push("/new-chat/direct")}
          h={Spacing.inputHeight}
        >
          <User color="text" />
          <Text color="text" fontWeight="600">Chat starten</Text>
        </Button>
        <Button
          justify="flex-start"
          disabled
          onPress={() => router.push("/new-chat/scan")}
          h={Spacing.inputHeight}>
          <QrCode color="textSecondary" />
          <YStack items="flex-start">
            <Text color="textSecondary" fontWeight="600">QR-Code scannen</Text>
            <Text color="textSecondary" fontSize={12}>Demnächst verfügbar</Text>
          </YStack>
        </Button>
      </YStack>
    </YStack>
  );
}
