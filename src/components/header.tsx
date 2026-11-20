import { useRouter } from "expo-router";
import { Button, Text, View, XStack, YStack } from "tamagui";
import { ChevronLeft } from "./icons";

export default function Header({
    title,
    subtitle,
    avatarLabel,
    avatarPlaceholder,
}: Readonly<{
    title?: string;
    subtitle?: string;
    avatarLabel?: string;
    avatarPlaceholder?: string;
}>) {
    const router = useRouter();
    return (
        <XStack gap={8} alignItems="center" justifyContent="center" py={16} px={24}>

            <Button variant={"quiet"} onPress={() => { router.back(); }}><ChevronLeft color="text" aria-label="Back" /></Button>

            <View
                aria-label={avatarLabel}
                width={48}
                height={48}
                alignItems="center"
                justifyContent="center"
                borderRadius={999}
                borderWidth={1}
                borderColor="accent"
                backgroundColor="background"
            >
                <Text fontWeight="600" color="text">
                    {avatarPlaceholder}
                </Text>
            </View>

            <YStack>
                <Text fontWeight="600" color="text" fontSize={24}>
                    {title}
                </Text>
                <Text color="text">
                    {subtitle}
                </Text>
            </YStack>
        </XStack>
    );
}
