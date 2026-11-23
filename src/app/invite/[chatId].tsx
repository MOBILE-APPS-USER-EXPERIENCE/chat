import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Text, YStack } from "tamagui";

import Header from "@/components/header";
import UserPicker, { type InviteeSelection } from "@/components/user-picker";
import { Spacing } from "@/config/layout";
import { useChat } from "@/hooks/use-chat";
import { useChatMembers } from "@/hooks/use-chat-members";
import { useProfiles } from "@/hooks/use-profiles";
import { syncRuntime } from "@/messaging/runtime";
import { useSession } from "@/session";
import { describeChatActionError } from "@/utils/chat-actions";

export default function InviteScreen() {
  const { chatId: param } = useLocalSearchParams<{ chatId: string }>();
  const chatId = Number(param);
  const { chat } = useChat(chatId);
  const { members } = useChatMembers(chatId);
  const { profiles } = useProfiles();
  const session = useSession();
  const selfUserid =
    session.status === "signed_in" ? session.account.userid : "";
  const [selected, setSelected] = useState<InviteeSelection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  if (chat !== null && chat.role !== "owner") {
    return (
      <YStack flex={1} backgroundColor="background">
        <Header title="Person einladen" />
        <YStack px={Spacing.four}>
          <Text color="error">Nur der Besitzer kann Personen einladen.</Text>
        </YStack>
      </YStack>
    );
  }

  function displayName(userid: string): string {
    const profile = profiles.find(
      (row) => row.userid.toLowerCase() === userid.toLowerCase(),
    );
    return (
      profile?.nickname?.trim() ||
      profile?.fullname?.trim() ||
      userid
    );
  }

  async function handleInvite() {
    if (selected.length === 0) return;
    if (chat?.directchat && selected.length > 1) {
      setError("Ein Direktchat kann nur eine Person einladen.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const remaining: InviteeSelection[] = [];
    const invitedNames: string[] = [];
    const failedNames: string[] = [];
    const failedReasons: string[] = [];

    for (const selection of selected) {
      const hash =
        selection.type === "profile" ? selection.profile.hash : selection.hash;
      const name =
        selection.type === "profile"
          ? selection.profile.nickname?.trim() ||
            selection.profile.fullname?.trim() ||
            selection.profile.userid
          : hash;

      try {
        await syncRuntime.inviteToChat(chatId, hash);
        invitedNames.push(name);
      } catch (error_) {
        remaining.push(selection);
        failedNames.push(name);
        failedReasons.push(describeChatActionError(error_));
      }
    }

    setSelected(remaining);
    if (invitedNames.length > 0) {
      setSuccess(`✓ ${invitedNames.join(", ")} eingeladen.`);
    }
    if (failedNames.length > 0) {
      setError(
        `${failedNames.join(", ")} konnte nicht eingeladen werden. ${
          [...new Set(failedReasons)].join(" ")
        }`.trim(),
      );
    }
    setBusy(false);
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Person einladen" />
      <YStack flex={1} px={Spacing.four} gap={Spacing.three}>
        <YStack gap={Spacing.one}>
          <Text fontWeight="600" color="text">Mitglieder</Text>
          {members
            .filter((member) => member.role !== "invited")
            .map((member) => (
              <Text key={member.userid} color="text">
                {displayName(member.userid)}
              </Text>
            ))}
        </YStack>
        <YStack gap={Spacing.one}>
          <Text fontWeight="600" color="text">Eingeladene Personen</Text>
          {members
            .filter((member) => member.role === "invited")
            .map((member) => (
              <Text key={member.userid} color="text">
                {displayName(member.userid)}
              </Text>
            ))}
        </YStack>
        <UserPicker
          profiles={profiles}
          selfUserid={selfUserid}
          selected={selected}
          onChange={setSelected}
          excludeUserids={members.map((member) => member.userid)}
        />
        {error && <Text color="error">{error}</Text>}
        {success && <Text color="text">{success}</Text>}
        <Button
          disabled={
            selected.length === 0 ||
            busy ||
            (chat?.directchat === true && selected.length > 1)
          }
          onPress={() => void handleInvite()}
        >
          Einladen
        </Button>
      </YStack>
    </YStack>
  );
}
