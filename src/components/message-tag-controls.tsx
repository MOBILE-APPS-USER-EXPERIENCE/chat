import { useState } from "react";
import { Button, Input, Label, ScrollView, Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";

export function MessageTagFilter({ tags, selected, onSelect }: Readonly<{
  tags: readonly string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}>) {
  return (
    <YStack px={Spacing.three} pb={Spacing.two} gap={Spacing.one}>
      <Text color="textSecondary">Nach Tag filtern</Text>
      <ScrollView horizontal>
        <XStack gap={Spacing.two}>
          <Button size="sm" aria-pressed={selected === null}
            backgroundColor={selected === null ? "backgroundSelected" : "backgroundElement"}
            onPress={() => onSelect(null)}>Alle Nachrichten</Button>
          {tags.map((tag) => (
            <Button key={tag} size="sm" aria-pressed={tag === selected}
              backgroundColor={tag === selected ? "backgroundSelected" : "backgroundElement"}
              onPress={() => onSelect(tag)}>{tag}</Button>
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}

export function MessageTagEditor({ initialTags, availableTags, onSave, onCancel }: Readonly<{
  initialTags: string[];
  availableTags: readonly string[];
  onSave: (tags: string[]) => Promise<void>;
  onCancel: () => void;
}>) {
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const name = input.trim();
  const updated = name && !tags.includes(name) ? [...tags, name] : tags;
  const existing = availableTags.filter((tag) => !tags.includes(tag));

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await onSave(updated);
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <YStack p={Spacing.three} backgroundColor="backgroundElement" gap={Spacing.two}>
      <Text color="text" fontWeight="700">Tags bearbeiten</Text>
      <Label htmlFor="message-tag-name" color="text">Tag-Name</Label>
      <XStack gap={Spacing.two}>
        <Input id="message-tag-name" flex={1} placeholder="z. B. Projekt A" value={input}
          disabled={saving} onChangeText={setInput} />
        <Button disabled={saving || updated === tags} onPress={() => {
          setTags(updated);
          setInput("");
        }}>Hinzufügen</Button>
      </XStack>
      {existing.length > 0 && (
        <YStack gap={Spacing.one}>
          <Text color="textSecondary">Vorhandene Tags</Text>
          <ScrollView horizontal keyboardShouldPersistTaps="handled">
            <XStack gap={Spacing.one}>
              {existing.map((tag) => (
                <Button key={tag} size="sm" disabled={saving} aria-label={`Tag ${tag} hinzufügen`}
                  onPress={() => {
                    setTags((current) => current.includes(tag) ? current : [...current, tag]);
                    setInput("");
                  }}>
                  {tag}
                </Button>
              ))}
            </XStack>
          </ScrollView>
        </YStack>
      )}
      {tags.length > 0 && (
        <ScrollView horizontal>
          <XStack gap={Spacing.one}>
            {tags.map((tag) => (
              <Button key={tag} size="sm" disabled={saving} aria-label={`Tag ${tag} entfernen`}
                onPress={() => setTags((current) => current.filter((entry) => entry !== tag))}>
                {tag} ×
              </Button>
            ))}
          </XStack>
        </ScrollView>
      )}
      {error && <Text color="error">Tags konnten nicht gespeichert werden.</Text>}
      <XStack gap={Spacing.two} justify="flex-end">
        <Button size="sm" disabled={saving} onPress={onCancel}>Abbrechen</Button>
        <Button size="sm" disabled={saving} onPress={() => void save()}>Tags speichern</Button>
      </XStack>
    </YStack>
  );
}
