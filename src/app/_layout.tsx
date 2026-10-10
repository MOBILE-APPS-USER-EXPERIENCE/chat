import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/global.css';

export default function RootLayout() {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return <SafeAreaProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F3F5F1' } }} />
  </SafeAreaProvider>;
}
