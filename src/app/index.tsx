import { Button, H2, Text, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/layout';
import { triggerPrimaryButtonHaptic } from '@/utils/primary-button-haptic';
import { router } from 'expo-router';


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
      <Button
        onPress={() => {
          triggerPrimaryButtonHaptic();
          router.push('/profile');
        }}>
        Profil
      </Button>

      <H2>Chat</H2>
      <Text color="textSecondary">Deine Chats werden hier angezeigt.</Text>
    </YStack>
  );
}
