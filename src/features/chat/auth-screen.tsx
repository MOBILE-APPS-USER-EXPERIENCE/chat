import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ApiError } from '@/api/apiClient';

import { errorText } from './format';
import { Button, ErrorBanner, Field, palette } from './ui';
import type { Credentials } from './use-session';
import { validateCredentials } from './validation';
import type { FieldErrors } from './validation';

type Props = {
  busy: boolean; notice: string;
  authenticate: (mode: 'login' | 'register', fields: Credentials) => Promise<void>;
};

export function AuthScreen({ busy, notice, authenticate }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [userid, setUserid] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [fullname, setFullname] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const useridRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);
  const fullnameRef = useRef<TextInput>(null);

  function focusFirst(errors: FieldErrors) {
    const refs = { userid: useridRef, password: passwordRef, nickname: nicknameRef, fullname: fullnameRef };
    const order: (keyof Credentials)[] = ['userid', 'nickname', 'fullname', 'password'];
    const first = order.find((field) => errors[field]);
    if (first) refs[first].current?.focus();
  }

  function clearFieldError(field: keyof Credentials) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  async function submit() {
    if (busy) return;
    const id = userid.trim();
    const fields = { userid: id, password, nickname: nickname.trim(), fullname: fullname.trim() };
    const errors = validateCredentials(mode, fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Bitte korrigiere die markierten Felder.');
      focusFirst(errors);
      return;
    }
    setError('');
    try {
      await authenticate(mode, fields);
      setPassword('');
    } catch (failure) {
      const fieldByCode: Record<number, keyof Credentials> = { 451: 'userid', 452: 'userid', 454: 'userid', 453: 'password', 455: 'password', 466: 'nickname', 467: 'nickname', 468: 'fullname', 469: 'fullname' };
      const field = failure instanceof ApiError ? fieldByCode[failure.code] : undefined;
      if (field) {
        const serverError = { [field]: errorText(failure) };
        setFieldErrors(serverError);
        setError('Bitte prüfe das markierte Feld.');
        focusFirst(serverError);
      } else setError(errorText(failure));
    }
  }

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.scroll, !wide && styles.scrollMobile]} keyboardShouldPersistTaps="handled">
      <View style={[styles.frame, !wide && styles.frameMobile]}>
        <View style={[styles.intro, !wide && styles.introMobile]}>
          <View style={styles.brand}><View style={styles.brandIcon}><Text style={styles.brandGlyph}>c.</Text></View><Text style={styles.brandName}>chat</Text></View>
          {wide && <View style={styles.introCopy}>
            <Text style={styles.eyebrow}>IM GESPRÄCH BLEIBEN</Text>
            <Text style={[styles.headline, !wide && { fontSize: 34 }]}>Ein Ort für{wide ? '\n' : ' '}eure Gespräche.</Text>
            <Text style={styles.description}>Kurze Frage, große Idee oder einfach ein Hallo. Deine Chats sind nur eine Anmeldung entfernt.</Text>
          </View>}
          {wide && <View style={styles.preview}>
            <View style={styles.previewBubble}><Text style={styles.previewAuthor}>Miteinander verbunden</Text><Text style={styles.previewText}>Deine Kontakte. Deine Gespräche.</Text><Text style={styles.previewTime}>Alles an einem Ort.</Text></View>
            <View style={styles.previewReply}><Text style={styles.previewReplyText}>Schön, dass du da bist.</Text><Text style={styles.previewReplyMark}>✓✓</Text></View>
          </View>}
          {wide && <Text style={styles.introFooter}>CHAT · HOCHSCHULE ESSLINGEN</Text>}
        </View>
        <View style={[styles.formSide, !wide && styles.formMobile]}>
          <View style={styles.form}>
            <Text style={styles.smallHeading}>DEIN KONTO</Text>
            <Text accessibilityRole="header" style={styles.title}>{mode === 'login' ? 'Willkommen zurück.' : 'Konto erstellen.'}</Text>
            <Text style={styles.subtitle}>{mode === 'login' ? 'Melde dich an und setze deine Gespräche fort.' : 'Erstelle dein Konto. Danach bist du direkt eingeloggt.'}</Text>
            <View style={styles.tabs}>
              {(['login', 'register'] as const).map((value) => <Pressable key={value} accessibilityRole="button"
                {...(Platform.OS === 'web' ? { 'aria-pressed': mode === value } : {})}
                accessibilityState={Platform.OS === 'web' ? { disabled: busy } : { selected: mode === value, disabled: busy }} disabled={busy} onPress={() => { setMode(value); setError(''); setFieldErrors({}); }}
                style={[styles.tab, mode === value && styles.tabActive]}>
                <Text style={[styles.tabLabel, mode === value && { color: palette.ink }]}>{value === 'login' ? 'Anmelden' : 'Registrieren'}</Text>
              </Pressable>)}
            </View>
            {!!notice && !error && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
            <ErrorBanner text={error} />
            <Text style={styles.requiredNote}>Alle Felder sind Pflichtfelder.</Text>
            <Field ref={useridRef} required error={fieldErrors.userid} label="HSE-Kennung" placeholder="abcdit01" hint="4 Buchstaben + it + 2 Ziffern, z. B. abcdit01" value={userid}
              onChangeText={(value) => { setUserid(value); clearFieldError('userid'); }}
              autoCapitalize="none" autoCorrect={false} autoComplete="username" editable={!busy} maxLength={8} />
            {mode === 'register' && <>
              <Field ref={nicknameRef} required error={fieldErrors.nickname} label="Anzeigename" placeholder="Wie möchtest du heißen?" hint="2 bis 30 Zeichen · So sehen dich andere im Chat."
                value={nickname} onChangeText={(value) => { setNickname(value); clearFieldError('nickname'); }} maxLength={30} editable={!busy} />
              <Field ref={fullnameRef} required error={fieldErrors.fullname} label="Vor- und Nachname" placeholder="Dein vollständiger Name" hint="2 bis 30 Zeichen"
                value={fullname} onChangeText={(value) => { setFullname(value); clearFieldError('fullname'); }} maxLength={30} autoComplete="name" editable={!busy} />
            </>}
            <Field ref={passwordRef} required error={fieldErrors.password} label="Passwort" placeholder={mode === 'register' ? 'Mindestens 6 Zeichen' : 'Dein Passwort'} value={password}
              hint={mode === 'register' ? 'Mindestens 6 Zeichen' : undefined}
              onChangeText={(value) => { setPassword(value); clearFieldError('password'); }} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
              trailing={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} disabled={busy}
                onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{showPassword ? 'Verbergen' : 'Anzeigen'}</Text></Pressable>}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} editable={!busy} onSubmitEditing={() => void submit()} />
            <Button busy={busy} busyLabel={mode === 'login' ? 'Wird angemeldet …' : 'Konto wird erstellt …'} onPress={() => void submit()}>{mode === 'login' ? 'Anmelden' : 'Konto erstellen'}</Button>
            <Text style={styles.footnote}>Deine Sitzung bleibt auf diesem Gerät gespeichert, bis du dich abmeldest oder der Token ungültig wird.</Text>
          </View>
        </View>
      </View>
      <Text style={styles.bottom}>Einfach schreiben. In Verbindung bleiben.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 36, gap: 24 },
  scrollMobile: { padding: 16, gap: 18 },
  frame: { width: '100%', maxWidth: 1000, flexDirection: 'row', borderRadius: 24, overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 20px 70px rgba(18, 62, 50, 0.08)' },
  frameMobile: { flexDirection: 'column', borderRadius: 20 },
  intro: { width: '46%', padding: 40, backgroundColor: palette.dark, justifyContent: 'space-between', gap: 40 },
  introMobile: { width: '100%', padding: 20, gap: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#D4ECD9', justifyContent: 'center', alignItems: 'center' },
  brandGlyph: { color: palette.dark, fontSize: 26, fontWeight: '800', marginTop: -5 },
  brandName: { color: '#fff', fontWeight: '600', fontSize: 24, letterSpacing: -0.8 },
  introCopy: { gap: 16 },
  eyebrow: { color: '#9ABDAD', fontSize: 10, fontWeight: '600', letterSpacing: 2 },
  headline: { color: '#F1F6EB', fontSize: 45, lineHeight: 52, fontWeight: '500', letterSpacing: -1.8 },
  description: { color: '#B2C8BB', fontSize: 14, lineHeight: 23, maxWidth: 290 },
  preview: { gap: 12 },
  previewBubble: { backgroundColor: '#295544', padding: 19, borderRadius: 16, borderBottomLeftRadius: 4, alignSelf: 'flex-start', gap: 7 },
  previewAuthor: { color: '#C4DBAA', fontSize: 11, fontWeight: '600' },
  previewText: { color: '#F1F6EB', fontSize: 13 },
  previewTime: { color: '#9EBAA8', fontSize: 10 },
  previewReply: { alignSelf: 'flex-end', backgroundColor: '#D4E8C4', padding: 17, borderRadius: 16, borderBottomRightRadius: 4, flexDirection: 'row', gap: 14 },
  previewReplyText: { color: palette.dark, fontSize: 13 },
  previewReplyMark: { color: palette.green, fontSize: 11 },
  introFooter: { color: '#B2C8BB', fontSize: 12, letterSpacing: 1 },
  formSide: { flex: 1, padding: 48, justifyContent: 'center' },
  formMobile: { padding: 25 },
  form: { gap: 18 },
  smallHeading: { color: palette.green, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '600', letterSpacing: -1, color: palette.ink },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: -8 },
  tabs: { flexDirection: 'row', backgroundColor: palette.soft, borderRadius: 10, padding: 4, marginBottom: 4 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 7, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { backgroundColor: '#fff', borderBottomColor: palette.green },
  tabLabel: { fontSize: 14, fontWeight: '600', color: palette.muted },
  notice: { color: palette.green, fontSize: 14, lineHeight: 21 },
  requiredNote: { color: palette.muted, fontSize: 13 },
  passwordToggle: { minWidth: 80, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  passwordToggleText: { color: palette.green, fontWeight: '600', fontSize: 13 },
  footnote: { fontSize: 13, color: palette.muted, lineHeight: 20, textAlign: 'center' },
  bottom: { color: palette.muted, fontSize: 12, letterSpacing: 0.3 },
});
