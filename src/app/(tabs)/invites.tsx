import { router } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { Button, Separator, Spinner, Text, XStack, YStack } from "tamagui";

import ConfirmDialog from "@/components/confirm-dialog";
import Header from "@/components/header";
import { Spacing } from "@/config/layout";
import { useInvitations } from "@/hooks/use-chat-lists";
import { useChatMembers } from "@/hooks/use-chat-members";
import { useProfiles } from "@/hooks/use-profiles";
import { syncRuntime } from "@/messaging/runtime";
import { useSession } from "@/session";
import type { ChatRow, ProfileRow } from "@/storage/types";
import { chatDisplayName, describeChatActionError } from "@/utils/chat-actions";

function profileName(userid: string | null, profiles: ProfileRow[]): string {
  if (!userid) return "unbekannt";
  const profile = profiles.find(
    (row) => row.userid.toLowerCase() === userid.toLowerCase(),
  );
  return profile?.nickname?.trim() ||
    profile?.fullname?.trim() ||
    userid ||
    "unbekannt";
}

function InvitationRow({
  chat,
  profiles,
  selfUserid,
}: Readonly<{
  chat: ChatRow;
  profiles: ProfileRow[];
  selfUserid: string;
}>) {
  const { members } = useChatMembers(chat.id, chat.directchat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const name = chat.directchat
    ? chatDisplayName({ chat, members, profiles, selfUserid })
    : chat.name;
  const inviter = chat.directchat
    ? name
    : profileName(chat.ownerUserid, profiles);

  async function accept() {
    setBusy(true);
    setError(undefined);
    try {
      await syncRuntime.joinChat(chat.id);
      router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chat.id) } });
    } catch (error_) {
      setError(describeChatActionError(error_, "join"));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setConfirmVisible(false);
    setBusy(true);
    setError(undefined);
    try {
      await syncRuntime.rejectInvite(chat.id);
    } catch (error_) {
      setError(describeChatActionError(error_, "reject"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <XStack gap={Spacing.two} py={Spacing.two} justify="space-between">
      <YStack gap={Spacing.one}>
        <Text fontWeight="600" color="text">{name}</Text>
        <Text color="textSecondary">Einladung von {inviter}</Text>
      </YStack>
      <XStack gap={Spacing.two}>
        <Button disabled={busy} onPress={() => void accept()}>Annehmen</Button>
        <Button disabled={busy} backgroundColor="error" color="errorText" onPress={() => setConfirmVisible(true)}>
          Ablehnen
        </Button>
      </XStack>
      {busy && <Spinner size="small" color="accent" />}
      {!!error && <Text color="error">{error}</Text>}
      <ConfirmDialog
        visible={confirmVisible}
        title="Einladung ablehnen"
        message="Möchtest du diese Einladung ablehnen?"
        confirmLabel="Ablehnen"
        onConfirm={() => void reject()}
        onCancel={() => setConfirmVisible(false)}
      />
    </XStack>
  );
}

function EmptySafeInvitationList({
  invitations,
  profiles,
  selfUserid,
}: Readonly<{
  invitations: ChatRow[];
  profiles: ProfileRow[];
  selfUserid: string;
}>) {
  return invitations.length === 0 ? (
    <YStack flex={1} items="center" justify="center">
      <Text color="textSecondary">Keine Einladungen.</Text>
    </YStack>
  ) : (
    <FlatList
      data={invitations}
      keyExtractor={(chat) => String(chat.id)}
      renderItem={({ item }) => (
        <InvitationRow chat={item} profiles={profiles} selfUserid={selfUserid} />
      )}
      ItemSeparatorComponent={<Separator borderColor={"backgroundSelected"} />}
    />
  )
}

export default function InvitesScreen() {
  const { invitations, loading } = useInvitations();
  const { profiles } = useProfiles();
  const session = useSession();
  const selfUserid = session.status === "signed_in" ? session.account.userid : "";

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Einladungen" showBackButton={false} />
      <YStack flex={1} px={Spacing.three} pt={Spacing.two} pb={Spacing.one} gap={Spacing.two}>
        {loading ? (
          <YStack flex={1} items="center" justify="center"><Spinner size="large" color="accent" /></YStack>
        ) : <EmptySafeInvitationList invitations={invitations} profiles={profiles} selfUserid={selfUserid} />}
      </YStack>
    </YStack>
  );
}
