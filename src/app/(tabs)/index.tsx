import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H2, Text, YStack } from 'tamagui';

import { Spacing } from '@/constants/layout';


export default function Index() {
  const insets = useSafeAreaInsets();

  return (
    <YStack
      items="center"
      flex={1}
      gap={Spacing.two}
      justify="center"
      px={Spacing.four}
      pt={insets.top + Spacing.five}
      pb={insets.bottom + Spacing.four}
      backgroundColor="background">

      <H2>Chat</H2>
      <Text color="textSecondary">Deine Chats werden hier angezeigt.</Text>
    </YStack>
  );
}
