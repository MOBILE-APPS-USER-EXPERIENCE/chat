import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H2, Text, YStack } from 'tamagui';

import { register } from '@/api/authService';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function RegisterScreen() {
  const theme = useTheme();
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
      await register(userid.trim(), password, nickname.trim(), fullname.trim());
      router.replace('/');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <YStack flex={1} backgroundColor="background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + Spacing.five,
              paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
            },
          ]}
          keyboardShouldPersistTaps="handled">
          <H2>Registrieren</H2>
          <Text color="textSecondary" style={styles.description}>
            Erstelle dein Konto für den Chat.
          </Text>

          <Text style={styles.label}>Hochschul-ID</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={!isSubmitting}
            onChangeText={setUserid}
            placeholder="z. B. abcdit01"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            value={userid}
          />

          <Text style={styles.label}>Passwort</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!isSubmitting}
            onChangeText={setPassword}
            placeholder="Passwort"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="next"
            secureTextEntry
            style={inputStyle}
            value={password}
          />

          <Text style={styles.label}>Spitzname</Text>
          <TextInput
            editable={!isSubmitting}
            onChangeText={setNickname}
            placeholder="Dein Spitzname"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            value={nickname}
          />

          <Text style={styles.label}>Vollständiger Name</Text>
          <TextInput
            editable={!isSubmitting}
            onChangeText={setFullname}
            onSubmitEditing={handleRegister}
            placeholder="Vor- und Nachname"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            style={inputStyle}
            value={fullname}
          />

          {!!(error) && (
            <Text color="error" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={handleRegister}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text },
              pressed && styles.pressed,
              isSubmitting && styles.disabled,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text color="background">Konto erstellen</Text>
            )}
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/login')}>
            <Text color="accent" fontSize={14} lineHeight={30} style={styles.switchLink}>
              Bereits registriert? Zum Login
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    width: '100%',
  },
  description: {
    marginBottom: Spacing.two,
  },
  label: {
    marginTop: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  error: {
    marginTop: Spacing.one,
  },
  button: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    justifyContent: 'center',
    marginTop: Spacing.two,
    minHeight: 48,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
  switchLink: {
    textAlign: 'center',
  },
});
