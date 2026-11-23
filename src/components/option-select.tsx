import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Adapt, Select, Sheet, Text, XStack } from "tamagui";

import { FontSize, Spacing } from "@/config/layout";

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * Single-choice picker. Same structure as the server picker in
 * `components/auth/server-field.tsx` (Select on web, bottom Sheet on touch).
 */
export default function OptionSelect<T extends string>({
  id,
  value,
  options,
  placeholder,
  disabled = false,
  onValueChange,
}: Readonly<{
  id: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: T) => void;
}>) {
  const insets = useSafeAreaInsets();

  function handleChange(raw: string) {
    const match = options.find((option) => option.value === raw);
    if (match) onValueChange(match.value);
  }

  // Annotated as string: otherwise Tamagui infers the narrower literal type "" from the fallback.
  const selectedValue: string = value ?? "";

  return (
    <Select value={selectedValue} onValueChange={handleChange}>
      <Select.Trigger
        id={id}
        borderColor="backgroundSelected"
        h={Spacing.inputHeight}
        px={Spacing.three}
        disabled={disabled}
      >
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>

      <Adapt when="max-md" platform="touch">
        <Sheet modal dismissOnSnapToBottom snapPointsMode="fit">
          {/* No overlay color: the only existing one is a hardcoded rgba (known deviation). */}
          <Sheet.Overlay />
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
          <Select.Group
            mb={insets.bottom + Spacing.three}
            gap={Spacing.three}
            py={Spacing.three}
          >
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                <XStack flex={1} items="center" justify="space-between">
                  <Select.ItemText fontSize={FontSize.standard}>
                    {option.label}
                  </Select.ItemText>
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
  );
}
