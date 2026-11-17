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

import { login } from '@/api/authService';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <ThemedView style={styles.container}>
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
          <ThemedText type="subtitle">Login</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            Melde dich bei deinem Chat-Konto an.
          </ThemedText>

          <ThemedText style={styles.label}>Hochschul-ID</ThemedText>
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

          <ThemedText style={styles.label}>Passwort</ThemedText>
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
            <ThemedText themeColor="error" style={styles.error}>
              {error}
            </ThemedText>
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
              <ThemedText style={{ color: theme.background }}>Einloggen</ThemedText>
            )}
          </Pressable>

          <Pressable accessibilityRole="link" onPress={() => router.replace('/register')}>
            <ThemedText type="linkPrimary" style={styles.switchLink}>
              Noch kein Konto? Jetzt registrieren
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
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
