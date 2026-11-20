import { AuthField } from '@/components/auth/auth-field';
import { AuthScreen } from '@/components/auth/auth-screen';
import { useAuthSubmit } from '@/hooks/use-auth-submit';
import { session } from '@/session';
import { useState } from 'react';

export default function LoginScreen() {
  const [userid, setUserid] = useState('');
  const [password, setPassword] = useState('');
  const { error, isSubmitting, submit } = useAuthSubmit('Login fehlgeschlagen.');

  const handleLogin = () =>
    submit(
      () => session.login(userid.trim(), password),
      !userid.trim() || !password ? 'Bitte gib Hochschul-ID und Passwort ein.' : undefined,
    );

  return (
    <AuthScreen
      title="Login"
      subtitle="Melde dich bei deinem Chat-Konto an."
      submitLabel="Einloggen"
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={handleLogin}
      switchLabel="Noch kein Konto? Jetzt registrieren"
      switchHref="/register">
      <AuthField
        id="login-userid"
        label="Hochschul-ID"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        disabled={isSubmitting}
        onChangeText={setUserid}
        placeholder="z. B. abcdit01"
        value={userid}
      />
      <AuthField
        id="login-password"
        label="Passwort"
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        type="password"
        disabled={isSubmitting}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
        placeholder="Passwort"
        returnKeyType="done"
        value={password}
      />
    </AuthScreen>
  );
}
