import { AuthField } from "@/components/auth/auth-field";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ServerField } from "@/components/auth/server-field";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { session } from "@/session";
import type { TamaguiElement } from "@tamagui/web";
import { useRef, useState } from "react";

export default function LoginScreen() {
  const [userid, setUserid] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<TamaguiElement>(null);
  const { error, isSubmitting, submit } = useAuthSubmit(
    "Login fehlgeschlagen.",
  );

  const handleLogin = () =>
    submit(
      () => session.login(userid.trim(), password),
      !userid.trim() || !password
        ? "Bitte gib Hochschul-ID und Passwort ein."
        : undefined,
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
      switchHref="/register"
    >
      <ServerField disabled={isSubmitting} />

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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={userid}
      />
      <AuthField
        ref={passwordRef}
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
