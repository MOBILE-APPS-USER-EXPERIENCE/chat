import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
} from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider, Text, YStack } from "tamagui";

import { Spacing } from "@/config/layout";
import "@/global.css";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { syncRuntime } from "@/messaging/runtime";
import { session, useSession } from "@/session";
import { useEffect, useState } from "react";
import { tamaguiConfig } from "../tamagui.config";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [initFailed, setInitFailed] = useState(false);
  const colorScheme = useColorScheme();
  const state = useSession();

  let theme = colorScheme === "dark" ? "dark" : "light";

  useEffect(() => {
    session
      .init()
      .then(() => {
        syncRuntime.start();
      })
      .catch(() => setInitFailed(true))
      .finally(() => {
        void SplashScreen.hideAsync();
      });
    return () => {
      syncRuntime.stop();
    };
  }, []);

  if (state.status === "initializing" && !initFailed) return null;
  const signedIn = state.status === "signed_in";

  return (
    <SafeAreaProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
        <ThemeProvider value={theme === "dark" ? DarkTheme : DefaultTheme}>
          {initFailed ? (
            <YStack
              flex={1}
              items="center"
              justify="center"
              px={Spacing.four}
              backgroundColor="background"
            >
              <Text color="error">
                Lokale Daten konnten nicht geladen werden. Bitte starte die App
                neu.
              </Text>
            </YStack>
          ) : (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="chat/[chatId]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="new-chat"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="new-chat/group"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="new-chat/direct"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="new-chat/scan"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="invite/[chatId]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="exam-phase"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="exam-phase/learning-status"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="exam-phase/create-room"
                  options={{ headerShown: false }}
                />
              </Stack.Protected>
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="(auth)/login" />
                <Stack.Screen name="(auth)/register" />
              </Stack.Protected>
            </Stack>
          )}
        </ThemeProvider>
      </TamaguiProvider>
    </SafeAreaProvider >
  );
}
