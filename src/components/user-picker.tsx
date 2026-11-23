import { useState } from "react";
import { FlatList } from "react-native";
import { Button, Input, Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";
import type { ProfileRow } from "@/storage/types";

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
}: Readonly<{
  profiles: ProfileRow[];
  selfUserid: string;
  selected: InviteeSelection[];
  onChange: (selections: InviteeSelection[]) => void;
  maxSelections?: number | null;
}>) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const selectedKeys = new Set(selected.map(selectionKey));

  const canAddMore =
    maxSelections === null || selected.length < maxSelections;

  // Search first, then exclude selected profiles from the displayed list.
  const allMatches = profiles.filter((profile) => {
    if (!canAddMore) return false;

    if (profile.missingSince !== null) return false;
    if (profile.userid.toLowerCase() === selfUserid.toLowerCase()) return false;
    if (needle.length === 0) return true;

    return (
      profile.userid.toLowerCase().includes(needle) ||
      (profile.nickname?.toLowerCase().includes(needle) ?? false) ||
      (profile.fullname?.toLowerCase().includes(needle) ?? false)
    );
  });

  const matches = allMatches.filter(
    (profile) =>
      !selectedKeys.has(selectionKey({ type: "profile", profile }))
  );

  const hashSelection: InviteeSelection = { type: "hash", hash: trimmed };
  const offerHash =
    allMatches.length === 0 &&
    /^[A-Za-z0-9]{8}$/.test(trimmed) &&
    !/^[a-z]{4}it\d{2}$/i.test(trimmed) &&
    !selectedKeys.has(selectionKey(hashSelection));

  const unknownUserid =
    allMatches.length === 0 && /^[a-z]{4}it\d{2}$/i.test(trimmed);

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
