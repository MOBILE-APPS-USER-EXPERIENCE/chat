import { Spacing } from "@/config/layout";
import { Text, View } from "tamagui";

export type AvatarProps = Readonly<{
  label: string;
  placeholder: string;
}>;

export default function Avatar(avatar: AvatarProps) {
  return (
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
      backgroundColor="backgroundElement"
    >
      <Text fontWeight="600" color="text">
        {avatar.placeholder}
      </Text>
    </View>
  );
}
