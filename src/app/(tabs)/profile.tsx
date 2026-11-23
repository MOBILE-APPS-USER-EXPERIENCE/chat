import ConfirmDialog from "@/components/confirm-dialog";
import { session, useSession } from "@/session";
import { describeAuthError } from "@/utils/auth-error";
import { useState } from "react";
import { Button, Text, YStack } from "tamagui";

import Header from "@/components/header";
import { Spacing } from "@/config/layout";
import { triggerPrimaryButtonHaptic } from "@/utils/primary-button-haptic";

export default function ProfileScreen() {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [error, setError] = useState<string>();
  const sessionState = useSession();

  async function handleLogout() {
    setError(undefined);
    try {
      await session.logout();
    } catch (caughtError) {
      setError(describeAuthError(caughtError, "Logout fehlgeschlagen."));
    }
  }

  async function confirmDeleteAccount() {
    setDialogVisible(false);
    setError(undefined);
    try {
      await session.deregister();
    } catch (caughtError) {
      setError(
        describeAuthError(caughtError, "Account konnte nicht gelöscht werden."),
      );
    }
  }

  /**
   * Generates user initials based on the username from the session state.
   * It extracts the first letter of each word in the username, converts them to uppercase,
   * and joins them together.
   *
   * @returns {string} - The initials of the user, or '?' if the username is not available.
   */
  function getUserInitials(): string {
    if (sessionState?.status !== "signed_in") return "?";

    const username = sessionState?.account?.nickname ?? "?";

    // Match Unicode letters that are preceded by a non-letter or start of string
    const initials = username.match(/(?:^|[^\p{L}])(\p{L})/gu);
    return initials
      ? initials
        .map((match) => match.replaceAll(/[^\p{L}]/gu, ""))
        .join("")
        .toUpperCase()
      : "?";
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <Header
        title="Profil"
        avatar={{
          label: "Initialien des Nicknames",
          placeholder: getUserInitials(),
        }}
        showBackButton={false}
      />

      <YStack
        flex={1}
        items="center"
        justify="center"
        gap={Spacing.two}
        px={Spacing.four}
      >
        {sessionState?.status === "signed_in" && (
          <>
            <Text fontSize={16} color="text">
              Willkommen,{" "}
              {sessionState?.account?.nickname ?? sessionState?.account?.userid}
              !
            </Text>
            <Text fontSize={16} color="text">
              Dein Benutzername: {sessionState?.account?.userid}
            </Text>
            <Text fontSize={16} color="text">
              Dein Einladungshash: {sessionState?.account?.userHash}
            </Text>
          </>
        )}

        <Button
          onPress={() => {
            triggerPrimaryButtonHaptic();
            void handleLogout();
          }}
        >
          Logout
        </Button>

        <Button
          backgroundColor="error"
          color="errorText"
          onPress={() => {
            triggerPrimaryButtonHaptic();
            setDialogVisible(true);
          }}
        >
          Account löschen
        </Button>

        {!!error && <Text color="error">{error}</Text>}
      </YStack>

      <ConfirmDialog
        visible={dialogVisible}
        title="Account löschen"
        message="Bist du sicher? Das kann nicht rückgängig gemacht werden.
Bereits gesendete Nachrichten werden nicht vom Server gelöscht."
        onConfirm={() => void confirmDeleteAccount()}
        onCancel={() => setDialogVisible(false)}
      />
    </YStack>
  );
}
