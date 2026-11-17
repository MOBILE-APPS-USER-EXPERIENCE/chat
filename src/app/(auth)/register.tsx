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

import { register } from '@/api/authService';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
          <ThemedText type="subtitle">Registrieren</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            Erstelle dein Konto für den Chat.
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

          <ThemedText style={styles.label}>Spitzname</ThemedText>
          <TextInput
            editable={!isSubmitting}
            onChangeText={setNickname}
            placeholder="Dein Spitzname"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            value={nickname}
          />

          <ThemedText style={styles.label}>Vollständiger Name</ThemedText>
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
            <ThemedText themeColor="error" style={styles.error}>
              {error}
            </ThemedText>
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
              <ThemedText style={{ color: theme.background }}>Konto erstellen</ThemedText>
            )}
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/login')}>
            <ThemedText type="linkPrimary" style={styles.switchLink}>
              Bereits registriert? Zum Login
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
