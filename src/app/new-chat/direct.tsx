import { router } from "expo-router";
import { useState } from "react";
import { Button, Text, YStack } from "tamagui";

import Header from "@/components/header";
import UserPicker, { type InviteeSelection } from "@/components/user-picker";
import { Spacing } from "@/config/layout";
import { useProfiles } from "@/hooks/use-profiles";
import { InviteAfterCreateError } from "@/messaging/chatActions";
import { syncRuntime } from "@/messaging/runtime";
import { useSession } from "@/session";
import { describeChatActionError, findExistingDirectChat } from "@/utils/chat-actions";

export default function DirectChatScreen() {
  const { profiles } = useProfiles();
  const state = useSession();
  const selfUserid =
    state.status === "signed_in" ? state.account.userid : "";
  const ownNickname =
    state.status === "signed_in"
      ? state.account.nickname?.trim() || selfUserid
      : selfUserid;
  const [selected, setSelected] = useState<InviteeSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState<{ chatId: number; hash: string } | null>(null);

  async function handleStart() {
    if (selected === null) return;
    setBusy(true);
    setError(undefined);
    setRetry(null);
    try {
      const hash =
        selected.type === "profile"
          ? selected.profile.hash
          : selected.hash;
      if (selected.type === "profile") {
        const storage = syncRuntime.getAccountStorage();
        if (storage !== null) {
          const chats = await storage.chats.list({ joined: true });
          const membersByChat = new Map<number, { userid: string }[]>();
          await Promise.all(
            chats
              .filter((chat) => chat.directchat)
              .map(async (chat) => {
                membersByChat.set(
                  chat.id,
                  await storage.chats.listMembers(chat.id),
                );
              }),
          );
          const existing = findExistingDirectChat({
            chats,
            membersByChat,
            otherUserid: selected.profile.userid,
          });
          if (existing !== null) {
            router.dismissAll();
            router.push({
              pathname: "/chat/[chatId]",
              params: { chatId: String(existing.id) },
            });
            return;
          }
        }
      }
      const otherName =
        selected.type === "profile"
          ? selected.profile.nickname?.trim() ||
          selected.profile.fullname?.trim() ||
          selected.profile.userid
          : hash;
      const result = await syncRuntime.createDirectChat({
        name: `${ownNickname} – ${otherName}`,
        inviteeHash: hash,
      });
      if (result.refreshed) {
        router.dismissAll();
        router.push({
          pathname: "/chat/[chatId]",
          params: { chatId: String(result.chatId) },
        });
      } else router.replace("/");
    } catch (error_) {
      if (error_ instanceof InviteAfterCreateError) {
        setRetry({
          chatId: error_.chatId,
          hash:
            selected.type === "profile"
              ? selected.profile.hash
              : selected.hash,
        });
      }
      setError(
        describeChatActionError(
          error_ instanceof InviteAfterCreateError ? error_.cause : error_,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (retry === null) return;
    setBusy(true);
    setError(undefined);
    try {
      await syncRuntime.inviteToChat(retry.chatId, retry.hash);
      router.dismissAll();
      router.push({
        pathname: "/chat/[chatId]",
        params: { chatId: String(retry.chatId) },
      });
    } catch (error_) {
      setError(describeChatActionError(error_));
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Chat starten" />
      <YStack flex={1} px={Spacing.four} gap={Spacing.three}>
        <UserPicker
          profiles={profiles}
          selfUserid={selfUserid}
          maxSelections={1}
          selected={selected === null ? [] : [selected]}
          onChange={(selections) =>
            setSelected(selections.length === 0 ? null : selections[selections.length - 1])
          }
        />
        {error && <Text color="error">{error}</Text>}
        {retry !== null ? (
          <Button disabled={busy} onPress={() => void handleRetry()} h={Spacing.inputHeight}>
            Erneut einladen
          </Button>
        ) : (
          <Button
            disabled={selected === null || busy}
            onPress={() => void handleStart()}
            h={Spacing.inputHeight}
          >
            Chat starten
          </Button>
        )}
      </YStack>
    </YStack>
  );
}
