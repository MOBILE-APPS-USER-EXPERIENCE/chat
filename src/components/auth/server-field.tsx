import { Spacing } from "@/constants/layout";
import { session, useSession } from "@/session";
import type { ServerEntry } from "@/storage/types";
import { useEffect, useState } from "react";
import { Adapt, Label, Select, Sheet, Text, XStack, YStack } from "tamagui";

type Props = {
  disabled?: boolean;
};

export function ServerField({ disabled }: Readonly<Props>) {
  const sessionState = useSession();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    session
      .listServers()
      .then((list) => {
        if (active) setServers(list);
      })
      .catch(() => {
        if (active) setError("Serverliste konnte nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedId =
    sessionState.status === "signed_out"
      ? sessionState.selectedServer?.id
      : undefined;

  async function handleChange(serverId: string) {
    setError(undefined);
    try {
      await session.selectServer(serverId);
    } catch {
      setError("Server konnte nicht ausgewählt werden.");
    }
  }

  return (
    <YStack gap={Spacing.one}>
      <Label htmlFor="server-select">Server</Label>
      <Select
        value={selectedId ?? ""}
        onValueChange={(value) => void handleChange(value)}
      >
        <Select.Trigger
          id="server-select"
          borderColor="backgroundSelected"
          h={48}
          px={Spacing.three}
          disabled={disabled || servers.length === 0}
        >
          <Select.Value placeholder="Server auswählen" />
        </Select.Trigger>

        <Adapt when="max-md" platform="touch">
          <Sheet modal dismissOnSnapToBottom snapPointsMode="fit">
            <Sheet.Overlay backgroundColor="rgba(0, 0, 0, 0.5)" />
            <Sheet.Container>
              <Sheet.Background backgroundColor="background" />
              <Sheet.ScrollView>
                <Adapt.Contents />
              </Sheet.ScrollView>
            </Sheet.Container>
          </Sheet>
        </Adapt>

        <Select.Content>
          <Select.Viewport>
            <Select.Group>
              {servers.map((server) => (
                <Select.Item key={server.id} value={server.id}>
                  <XStack flex={1} items="center" justify="space-between">
                    <Select.ItemText>{server.name}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Text>✓</Text>
                    </Select.ItemIndicator>
                  </XStack>
                </Select.Item>
              ))}
            </Select.Group>
          </Select.Viewport>
        </Select.Content>
      </Select>
      {!!error && <Text color="error">{error}</Text>}
    </YStack>
  );
}
