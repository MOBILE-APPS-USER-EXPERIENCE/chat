import { Spacing } from '@/constants/layout';
import { session } from '@/session';
import { describeAuthError } from '@/utils/auth-error';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Form, H2, Input, Label, ScrollView, Spinner, Text, YStack } from 'tamagui';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [userid, setUserid] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [fullname, setFullname] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    if (!userid.trim() || !password || !nickname.trim() || !fullname.trim()) {
      setError('Bitte fülle alle Felder aus.');
      return;
    }

    setError(undefined);
    setIsSubmitting(true);
    try {
      await session.register(userid.trim(), password, nickname.trim(), fullname.trim());
    } catch (caughtError) {
      setError(describeAuthError(caughtError, 'Registrierung fehlgeschlagen.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="background">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          px={Spacing.four}
          pt={insets.top + Spacing.five}
          pb={insets.bottom + Spacing.four}>
          <Form onSubmit={() => void handleRegister()}>
            <YStack self="center" gap={Spacing.two} w="100%">
              <H2>Registrieren</H2>
              <Text color="textSecondary" mb={Spacing.two}>
                Erstelle dein Konto für den Chat.
              </Text>

              <YStack gap={Spacing.one}>
                <Label htmlFor="register-userid">Hochschul-ID</Label>
                <Input
                  id="register-userid"
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
                <Label htmlFor="register-password">Passwort</Label>
                <Input
                  id="register-password"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  disabled={isSubmitting}
                  onChangeText={setPassword}
                  onSubmitEditing={() => undefined}
                  placeholder="Passwort"
                  returnKeyType="next"
                  secureTextEntry
                  value={password}
                  borderColor="backgroundSelected"
                  color="text"
                  h={48}
                  px={Spacing.three}
                />
              </YStack>

              <YStack gap={Spacing.one}>
                <Label htmlFor="register-nickname">Anzeigename</Label>
                <Input
                  id="register-nickname"
                  autoComplete="nickname"
                  textContentType="nickname"
                  disabled={isSubmitting}
                  onChangeText={setNickname}
                  onSubmitEditing={() => undefined}
                  placeholder="Dein Anzeigename"
                  returnKeyType="next"
                  value={nickname}
                  borderColor="backgroundSelected"
                  color="text"
                  h={48}
                  px={Spacing.three}
                />
              </YStack>

              <YStack gap={Spacing.one}>
                <Label htmlFor="register-fullname">Vollständiger Name</Label>
                <Input
                  id="register-fullname"
                  autoComplete="name"
                  textContentType="name"
                  disabled={isSubmitting}
                  onChangeText={setFullname}
                  onSubmitEditing={handleRegister}
                  placeholder="Vor- und Nachname"
                  returnKeyType="done"
                  value={fullname}
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
                  {isSubmitting ? <Spinner color="background" /> : 'Konto erstellen'}
                </Button>
              </Form.Trigger>
              <Button
                variant="quiet"
                color="accent"
                fontSize={14}
                lineHeight={30}
                onPress={() => router.replace('/login')}>
                Bereits registriert? Zum Login
              </Button>
            </YStack>
          </Form>
        </ScrollView>
      </KeyboardAvoidingView>
    </YStack>
  );
}
