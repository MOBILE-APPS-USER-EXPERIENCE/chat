import { router } from "expo-router";
import { useState } from "react";
import { Button, Input, Label, Switch, Text, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import { FontSize, Spacing } from "@/config/layout";
import { syncRuntime } from "@/messaging/runtime";
import { describeChatActionError } from "@/utils/chat-actions";

export default function NewGroupScreen() {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleCreate() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await syncRuntime.createGroup({ name, isPublic });
      if (result.refreshed) {
        router.dismissAll();
        router.push({
          pathname: "/chat/[chatId]",
          params: { chatId: String(result.chatId) },
        });
      } else router.replace("/");
    } catch (error_) {
      setError(describeChatActionError(error_));
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Gruppe erstellen" />
      <YStack px={Spacing.four} gap={Spacing.four}>
        <YStack gap={Spacing.two}>
          <Label htmlFor="group-name">Name der Gruppe</Label>
          <Input
            id="group-name"
            value={name}
            onChangeText={setName}
            placeholder="Name der Gruppe"
            borderColor="backgroundSelected"
            color="text"
            placeholderTextColor="textSecondary"
            h={Spacing.inputHeight}
          />
        </YStack>
        <YStack gap={Spacing.one}>
          <XStack items="center" justify="space-between">
            <Label htmlFor="public-group">Öffentlich</Label>
            <Switch
              id="public-group"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              backgroundColor={isPublic ? "accent" : "backgroundSelected"}
              aria-label="Öffentlich"
            >
              <Switch.Thumb backgroundColor="background" />
            </Switch>
          </XStack>
          <Text color="textSecondary" fontSize={FontSize.one}>
            Öffentliche Gruppen kann jede Person betreten. Private Gruppen nur mit Einladung.
          </Text>
        </YStack>
        {error && <Text color="error">{error}</Text>}
        <Button disabled={busy} onPress={() => void handleCreate()}
          h={Spacing.inputHeight}>
          {busy ? "Erstellen…" : "Erstellen"}
        </Button>
      </YStack>
    </YStack>
  );
}
