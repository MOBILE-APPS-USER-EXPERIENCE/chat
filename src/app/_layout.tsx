import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { tamaguiConfig } from '../tamagui.config';


export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? 'dark' : 'light';

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
