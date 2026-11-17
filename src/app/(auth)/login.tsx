import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Form, H2, Input, Label, ScrollView, Spinner, Text, YStack } from 'tamagui';

import { login } from '@/api/authService';
import { Spacing } from '@/constants/layout';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [userid, setUserid] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    if (!userid.trim() || !password) {
      setError('Bitte gib Hochschul-ID und Passwort ein.');
      return;
    }

    setError(undefined);
    setIsSubmitting(true);
    try {
      await login(userid.trim(), password);
      router.replace('/');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Login fehlgeschlagen.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          px={Spacing.four}
          pt={insets.top + Spacing.five}
          pb={insets.bottom + Spacing.four}>
          <Form onSubmit={() => void handleLogin()}>
            <YStack self="center" gap={Spacing.two} w="100%">
              <H2>Login</H2>
              <Text color="textSecondary" mb={Spacing.two}>
                Melde dich bei deinem Chat-Konto an.
              </Text>

              <YStack gap={Spacing.one}>
                <Label htmlFor="login-userid">Hochschul-ID</Label>
                <Input
                  id="login-userid"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  disabled={isSubmitting}
                  onChangeText={setUserid}
                  placeholder="z. B. abcdit01"
                  value={userid}
                  borderColor="backgroundSelected"
                  color="text"
                  h={48}
                  px={Spacing.three}
                />
              </YStack>

              <YStack gap={Spacing.one}>
                <Label htmlFor="login-password">Passwort</Label>
                <Input
                  id="login-password"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  type="password"
                  disabled={isSubmitting}
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="Passwort"
                  returnKeyType="done"
                  secureTextEntry={true}
                  value={password}
                  borderColor="backgroundSelected"
                  color="text"
                  h={48}
                  px={Spacing.three}
                />
              </YStack>

              {!!error && <Text color="error" mt={Spacing.one}>{error}</Text>}

              <Form.Trigger asChild>
                <Button
                  disabled={isSubmitting}
                  backgroundColor="text"
                  color="background"
                  mt={Spacing.two}
                  h={48}>
                  {isSubmitting ? <Spinner color="background" /> : 'Einloggen'}
                </Button>
              </Form.Trigger>

              <Button
                variant="quiet"
                color="accent"
                fontSize={14}
                lineHeight={30}
                onPress={() => router.replace('/register')}>
                Noch kein Konto? Jetzt registrieren
              </Button>
            </YStack>
          </Form>
        </ScrollView>
      </KeyboardAvoidingView>
    </YStack>
  );
}
