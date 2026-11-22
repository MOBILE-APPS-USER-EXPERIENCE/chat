import { FontSize, Spacing } from "@/config/layout";
import { session, useSession } from "@/session";
import {
  addAndSelectServer,
  checkServerUrl,
  type CheckServerResult,
} from "@/session/serverCheck";
import { changeServer, testServer } from "@/session/serverSettings";
import { parseServerUrl, type ServerUrlFailure } from "@/session/serverUrl";
import type { ServerEntry } from "@/storage/types";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Adapt,
  Button,
  Label,
  Select,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";
import { AuthField } from "./auth-field";
type Props = {
  disabled?: boolean;
};

type CheckState =
  | { status: "idle" }
  | { status: "testing"; url: string }
  | CheckServerResult;

const IDLE: CheckState = { status: "idle" };

const INVALID_MESSAGES: Record<ServerUrlFailure, string> = {
  empty: "Bitte gib eine Server-URL ein.",
  invalid: "Das ist keine gültige Server-URL.",
  unsupported_scheme: "Nur http:// und https:// werden unterstützt.",
  has_credentials:
    "Die URL darf keinen Benutzernamen und kein Passwort enthalten.",
  has_query_or_hash: "Die URL darf keine Parameter (?) oder Anker (#) enthalten.",
};

export function ServerField({ disabled }: Readonly<Props>) {
  const insets = useSafeAreaInsets();
  const sessionState = useSession();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [error, setError] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [check, setCheck] = useState<CheckState>(IDLE);
  const [adding, setAdding] = useState(false);
  const [panelError, setPanelError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // Bumped on every edit, new operation and on unmount: results of older runs are ignored.
  const generation = useRef(0);

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

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const selectedId =
    sessionState.status === "signed_out"
      ? sessionState.selectedServer?.id
      : undefined;

  const testing = check.status === "testing";
  const blocked = !!disabled || adding || testing;
  const parsedInput = parseServerUrl(urlInput);
  const canAdd =
    check.status === "ok" && parsedInput.ok && parsedInput.url === check.url;

  async function handleChange(serverId: string) {
    setError(undefined);
    try {
      await session.selectServer(serverId);
    } catch {
      setError("Server konnte nicht ausgewählt werden.");
    }
  }

  function handleUrlChange(text: string) {
    generation.current += 1; // invalidates a running test
    setUrlInput(text);
    setCheck(IDLE);
    setPanelError(undefined);
    setNotice(undefined);
  }

  function handleToggle() {
    setPanelOpen((open) => !open);
    setNotice(undefined);
  }

  async function handleTest() {
    if (blocked) return;
    setPanelError(undefined);
    setNotice(undefined);
    const parsed = parseServerUrl(urlInput);
    if (!parsed.ok) {
      setCheck({ status: "invalid", reason: parsed.reason });
      return;
    }
    generation.current += 1;
    const run = generation.current;
    setCheck({ status: "testing", url: parsed.url });
    let result: CheckServerResult;
    try {
      result = await checkServerUrl(parsed.url, testServer);
    } catch {
      // Unexpected (non-network) error from the ping: shown like an unreachable server.
      result = { status: "unreachable", url: parsed.url };
    }
    if (run !== generation.current) return; // URL edited or unmounted meanwhile
    setCheck(result);
  }

  async function handleAdd() {
    if (blocked || check.status !== "ok") return;
    generation.current += 1;
    const run = generation.current;
    setAdding(true);
    setPanelError(undefined);
    setNotice(undefined);

    let result;
    try {
      result = await addAndSelectServer(check.url, {
        listServerUrls: async () =>
          (await session.listServers()).map((server) => server.url),
        changeServer,
      });
    } catch {
      if (run !== generation.current) return;
      setPanelError("Server konnte nicht hinzugefügt werden.");
      setAdding(false);
      return;
    }
    if (run !== generation.current) return;

    if (result.status === "invalid") {
      setCheck({ status: "invalid", reason: result.reason });
      setAdding(false);
      return;
    }

    setUrlInput("");
    setCheck(IDLE);
    setPanelOpen(false);
    if (result.status === "existing") {
      setNotice("Server war bereits vorhanden und wurde ausgewählt.");
    }

    try {
      const list = await session.listServers();
      if (run !== generation.current) return;
      setServers(list);
    } catch {
      if (run !== generation.current) return;
      setError("Serverliste konnte nicht geladen werden.");
    }
    setAdding(false);
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
          disabled={blocked || servers.length === 0}
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
            <Select.Group mb={insets.bottom + Spacing.three} gap={Spacing.three} py={Spacing.three}>
              {servers.map((server) => (
                <Select.Item key={server.id} value={server.id}>
                  <XStack flex={1} items="center" justify="space-between">
                    <Select.ItemText fontSize={FontSize.three}>{server.name}</Select.ItemText>
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
      {!!notice && <Text color="text">{notice}</Text>}

      <Button
        variant="quiet"
        color="accent"
        fontSize={14}
        h={30}
        self="flex-start"
        aria-expanded={panelOpen}
        disabled={blocked}
        onPress={handleToggle}
      >
        Eigenen Server hinzufügen
      </Button>

      {panelOpen && (
        <YStack
          gap={Spacing.two}
          p={Spacing.three}
          borderWidth={1}
          borderColor="backgroundSelected"
        >
          <AuthField
            id="server-url"
            label="Server-URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            placeholder="https://chat.example.de"
            disabled={!!disabled || adding}
            value={urlInput}
            onChangeText={handleUrlChange}
            onSubmitEditing={() => void handleTest()}
          />

          {check.status === "invalid" && (
            <Text color="error">{INVALID_MESSAGES[check.reason]}</Text>
          )}
          {check.status === "ok" && (
            <Text color="text">✓ Server erreichbar.</Text>
          )}
          {check.status === "unreachable" && (
            <YStack gap={Spacing.one}>
              <Text color="error">
                Server nicht erreichbar oder antwortet nicht wie erwartet.
              </Text>
              {check.url.startsWith("http://") && (
                <Text color="textSecondary">
                  Unverschlüsselte Server (http) werden im Browser
                  möglicherweise blockiert.
                </Text>
              )}
              <Text color="textSecondary">
                Im Browser muss der Server Anfragen von dieser Seite erlauben
                (CORS).
              </Text>
            </YStack>
          )}
          {!!panelError && <Text color="error">{panelError}</Text>}

          <XStack gap={Spacing.two}>
            <Button
              flex={1}
              h={48}
              backgroundColor="backgroundElement"
              color="text"
              disabled={blocked}
              onPress={() => void handleTest()}
            >
              {testing ? <Spinner color="text" /> : "Verbindung testen"}
            </Button>
            <Button
              flex={1}
              h={48}
              backgroundColor="text"
              color="background"
              disabled={blocked || !canAdd}
              onPress={() => void handleAdd()}
            >
              {adding ? <Spinner color="background" /> : "Hinzufügen"}
            </Button>
          </XStack>
        </YStack>
      )}
    </YStack>
  );
}
