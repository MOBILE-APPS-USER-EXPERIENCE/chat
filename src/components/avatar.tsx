import { FontSize, Spacing } from "@/config/layout";
import { GetProps, Text, View } from "tamagui";

export type AvatarProps = Readonly<
  Omit<GetProps<typeof View>, "label" | "placeholder"> & {
    label: string;
    placeholder: string;
  }>;

export default function Avatar({ label, placeholder, ...viewProps }: AvatarProps,) {
  return (
    <View
      minW={Spacing.seven}
      h={Spacing.seven}
      items="center"
      justify="center"
      rounded={999}
      borderWidth={1}
      borderColor="backgroundElement"
      backgroundColor="backgroundSelected"
      {...viewProps}
      aria-label={label}
    >
      <Text fontWeight="600" color="text" fontSize={FontSize.larger}>
        {placeholder}
      </Text>
    </View>
  );
}
