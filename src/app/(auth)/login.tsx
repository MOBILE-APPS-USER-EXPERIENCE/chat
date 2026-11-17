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

import { login } from '@/api/authService';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
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
          <H2>Login</H2>
          <Text color="textSecondary" style={styles.description}>
            Melde dich bei deinem Chat-Konto an.
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
            autoComplete="current-password"
            editable={!isSubmitting}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            placeholder="Passwort"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            secureTextEntry
            style={inputStyle}
            value={password}
          />

          {!!error && (
            <Text color="error" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text },
              pressed && styles.pressed,
              isSubmitting && styles.disabled,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text color="background">Einloggen</Text>
            )}
          </Pressable>

          <Pressable accessibilityRole="link" onPress={() => router.replace('/register')}>
            <Text color="accent" fontSize={14} lineHeight={30} style={styles.switchLink}>
              Noch kein Konto? Jetzt registrieren
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
