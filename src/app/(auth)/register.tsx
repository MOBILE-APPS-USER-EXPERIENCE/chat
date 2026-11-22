import { AuthField } from "@/components/auth/auth-field";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ServerField } from "@/components/auth/server-field";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { session } from "@/session";
import { useState } from "react";

export default function RegisterScreen() {
  const [userid, setUserid] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [fullname, setFullname] = useState("");
  const { error, isSubmitting, submit } = useAuthSubmit(
    "Registrierung fehlgeschlagen.",
  );

  const handleRegister = () =>
    submit(
      () =>
        session.register(
          userid.trim(),
          password,
          nickname.trim(),
          fullname.trim(),
        ),
      !userid.trim() || !password || !nickname.trim() || !fullname.trim()
        ? "Bitte fülle alle Felder aus."
        : undefined,
    );

  return (
    <AuthScreen
      title="Registrieren"
      subtitle="Erstelle dein Konto für den Chat."
      submitLabel="Konto erstellen"
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={handleRegister}
      switchLabel="Bereits registriert? Zum Login"
      switchHref="/login"
    >
      <ServerField disabled={isSubmitting} />

      <AuthField
        id="register-userid"
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
        id="register-password"
        label="Passwort"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        type="password"
        disabled={isSubmitting}
        onChangeText={setPassword}
        placeholder="Passwort"
        returnKeyType="next"
        value={password}
      />
      <AuthField
        id="register-nickname"
        label="Anzeigename"
        autoComplete="nickname"
        textContentType="nickname"
        disabled={isSubmitting}
        onChangeText={setNickname}
        placeholder="Dein Anzeigename"
        returnKeyType="next"
        value={nickname}
      />
      <AuthField
        id="register-fullname"
        label="Vollständiger Name"
        autoComplete="name"
        textContentType="name"
        disabled={isSubmitting}
        onChangeText={setFullname}
        onSubmitEditing={handleRegister}
        placeholder="Vor- und Nachname"
        returnKeyType="done"
        value={fullname}
      />
    </AuthScreen>
  );
}
