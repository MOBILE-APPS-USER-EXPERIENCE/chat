import { useState } from "react";
import { FlatList } from "react-native";
import { Button, Input, Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";
import type { ProfileRow } from "@/storage/types";
import { resolveInvitee } from "@/utils/chat-actions";

export type InviteeSelection =
  | { type: "profile"; profile: ProfileRow }
  | { type: "hash"; hash: string };

function selectionKey(selection: InviteeSelection): string {
  return selection.type === "profile"
    ? `profile:${selection.profile.userid.toLowerCase()}`
    : `hash:${selection.hash}`;
}

function selectionLabel(selection: InviteeSelection): string {
  return selection.type === "profile"
    ? selection.profile.nickname ??
    selection.profile.fullname ??
    selection.profile.userid
    : `Hash verwenden: ${selection.hash}`;
}

export default function UserPicker({
  profiles,
  selfUserid,
  selected,
  onChange,
  maxSelections = null,
  excludeUserids = [],
}: Readonly<{
  profiles: ProfileRow[];
  selfUserid: string;
  selected: InviteeSelection[];
  onChange: (selections: InviteeSelection[]) => void;
  maxSelections?: number | null;
  excludeUserids?: string[];
}>) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const selectedKeys = new Set(selected.map(selectionKey));
  const selectedProfileUserids = selected
    .filter((selection) => selection.type === "profile")
    .map((selection) => selection.profile.userid);
  const search = resolveInvitee(
    trimmed,
    profiles,
    selfUserid,
    [...excludeUserids, ...selectedProfileUserids],
  );

  const canAddMore =
    maxSelections === null || selected.length < maxSelections;

  const matches = canAddMore ? search.matches : [];
  const hashSelection: InviteeSelection =
    search.resolution?.type === "hash"
      ? { type: "hash", hash: search.resolution.hash }
      : { type: "hash", hash: trimmed };
  const offerHash =
    search.resolution?.type === "hash" &&
    !selectedKeys.has(selectionKey(hashSelection));

  const unknownUserid =
    search.resolution?.type === "userid-not-found";

  function addSelection(selection: InviteeSelection) {
    if (canAddMore &&
      !selectedKeys.has(selectionKey(selection))) {
      onChange([...selected, selection]);
    }
    setQuery("");
  }

  function removeSelection(selection: InviteeSelection) {
    const key = selectionKey(selection);
    onChange(selected.filter((item) => selectionKey(item) !== key));
  }

  return (
    <YStack gap={Spacing.two}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Name, Hochschul-ID oder Hash"
        borderColor="backgroundSelected"
        color="text"
        placeholderTextColor="textSecondary"
        h={Spacing.inputHeight}
      />

      <XStack gap={Spacing.two} items="center" flexWrap="wrap">
        {selected.map((selection) => (
          <Button
            key={selectionKey(selection)}
            variant="outlined"
            backgroundColor="backgroundSelected"
            onPress={() => removeSelection(selection)}
            h={Spacing.inputHeight}
          >
            <Text color="text">{selectionLabel(selection)} ✕</Text>
          </Button>
        ))}
      </XStack>

      {unknownUserid && (
        <Text color="textSecondary">
          Person nicht gefunden. Die Liste wird regelmäßig aktualisiert.
        </Text>
      )}

      {offerHash && (
        <Button
          variant="outlined"
          justify="flex-start"
          onPress={() => addSelection(hashSelection)}
          h={Spacing.inputHeight}
        >
          <Text color="text">Hash verwenden: {trimmed}</Text>
        </Button>
      )}

      <FlatList
        data={matches}
        keyExtractor={(profile) => profile.userid}
        renderItem={({ item }) => (
          <Button
            variant="quiet"
            justify="flex-start"
            onPress={() => addSelection({ type: "profile", profile: item })}
            backgroundColor="hover:backgroundSelected press:backgroundSelected"
          >
            <YStack items="flex-start" justify="flex-start">
              <Text fontWeight="600" color="text">
                {item.nickname ?? item.fullname ?? item.userid}
              </Text>
              {item.nickname !== null && item.fullname !== null && (
                <>
                  <Text color="textSecondary" fontSize={12}>
                    {item.userid}
                  </Text>
                  <Text color="textSecondary" fontSize={12}>
                    {item.fullname}
                  </Text>
                </>
              )}
            </YStack>
          </Button>
        )}
      />
    </YStack>
  );
}
