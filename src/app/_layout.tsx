import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

import { initApiClient } from '@/api/apiClient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import '@/global.css';
import { useEffect, useState } from 'react';
import { tamaguiConfig } from '../tamagui.config';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const colorScheme = useColorScheme();

  const theme = colorScheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    initApiClient()
      .catch(console.error)
      .finally(() => {
        setReady(true);
        void SplashScreen.hideAsync();
      });
  }, []);

  if (!ready) return null;
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
      <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: true,
            headerBackTitle: '',
          }}
        />
      </ThemeProvider>
    </TamaguiProvider>
  );
}
