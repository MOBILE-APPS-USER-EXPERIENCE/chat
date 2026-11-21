import { Spacing } from "@/constants/layout";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, View, XStack, YStack } from "tamagui";
import { ChevronLeft } from "./icons";

export type AvatarProps = Readonly<{
  label: string;
  placeholder: string;
}>;
export default function Header({
  title,
  subtitle,
  avatar,
  showBackButton = true,
}: Readonly<{
  title?: string;
  subtitle?: string;
  avatar?: AvatarProps;
  showBackButton?: boolean;
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
      px={Spacing.four}
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
        <View
          aria-label={avatar.label}
          minW={Spacing.seven}
          h={Spacing.seven}
          marginInline={Spacing.two}
          marginBlock={Spacing.two}
          items="center"
          justify="center"
          rounded={999}
          borderWidth={1}
          borderColor="accent"
          backgroundColor="background"
        >
          <Text fontWeight="600" color="text">
            {avatar.placeholder}
          </Text>
        </View>
      )}

      <YStack>
        <Text fontWeight="600" color="text" fontSize={24}>
          {title}
        </Text>
        <Text color="text">{subtitle}</Text>
      </YStack>
    </XStack>
  );
}
