import { Spacing } from "@/config/layout";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack, YStack } from "tamagui";
import Avatar, { AvatarProps } from "./avatar";
import { ChevronLeft } from "./icons";

export default function Header({
  title,
  subtitle,
  avatar,
  showBackButton = true,
  action,
  showSeparator = false,
}: Readonly<{
  title?: string;
  subtitle?: string;
  avatar?: AvatarProps;
  showBackButton?: boolean;
  action?: ReactNode;
  showSeparator?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const verticalPadding = Spacing.three;
  const paddingTop = insets.top + verticalPadding;

  return (
    <XStack
      w="100%"
      h={paddingTop + Spacing.seven + verticalPadding}
      gap={Spacing.two}
      items="center"
      justify="flex-start"
      pt={paddingTop}
      pb={verticalPadding}
      px={Spacing.three}
      borderBottomWidth={showSeparator ? 1 : 0}
      borderBottomColor={showSeparator ? "accent" : "transparent"}
    >
      {showBackButton && (
        <Button
          ml={-Spacing.three}
          mr={-Spacing.two}
          variant="quiet"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
              return;
            }
            router.push("/");
          }}
        >
          <ChevronLeft color="text" aria-label="Back" />
        </Button>
      )}

      {avatar && (
        <Avatar label={avatar.label} placeholder={avatar.placeholder} mr={Spacing.two} />
      )}

      <YStack flex={1}>
        <Text fontWeight="600" color="text" fontSize={24}>
          {title}
        </Text>
        {subtitle && (
          <Text color="text">{subtitle}</Text>
        )}
      </YStack>
      {action}
    </XStack>
  );
}
