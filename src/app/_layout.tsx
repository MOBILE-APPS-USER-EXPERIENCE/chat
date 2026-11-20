import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { TamaguiProvider, Text, YStack } from 'tamagui';

import { Spacing } from '@/constants/layout';
import '@/global.css';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { session, useSession } from '@/session';
import { useEffect, useState } from 'react';
import { tamaguiConfig } from '../tamagui.config';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [initFailed, setInitFailed] = useState(false);
  const colorScheme = useColorScheme();
  const state = useSession();

  let theme = colorScheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    session.init()
      .catch(() => setInitFailed(true))
      .finally(() => { void SplashScreen.hideAsync(); });
  }, []);

  if (state.status === 'initializing' && !initFailed) return null;
  const signedIn = state.status === 'signed_in';

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
      <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
        {initFailed ? (
          <YStack flex={1} items="center" justify="center" px={Spacing.four} backgroundColor="background">
            <Text color="error">Lokale Daten konnten nicht geladen werden. Bitte starte die App neu.</Text>
          </YStack>
        ) : (
          <Stack screenOptions={{ headerShown: true, headerBackTitle: '' }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)/index" />
              <Stack.Screen name="(tabs)/profile" />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="(auth)/register" />
            </Stack.Protected>
          </Stack>
        )}
      </ThemeProvider>
    </TamaguiProvider>
  );
}
