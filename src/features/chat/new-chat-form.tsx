import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { invite } from '@/api/inviteService';
import type { User } from '@/api/types';
import { getProfiles } from '@/api/userService';

import { decodeText, errorText } from './format';
import { personName } from './chat-title';
import { Avatar, Button, ErrorBanner, Field, palette } from './ui';
import type { Session } from './use-session';

type Props = {
  session: Session;
  create: (name: string, ispublic: boolean, directchat?: boolean) => Promise<number>;
  onInviteSent: (chatid: number, user: User) => void;
  join: (chatid: number) => Promise<void>;
  onError: (error: unknown, token: string) => void;
  onClose: () => void;
  onCreated: (chatid: number) => void;
};

export function NewChatForm({ session, create, join, onInviteSent, onError, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [ispublic, setPublic] = useState(false);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const chatid = useRef<number | null>(null);
  const pending = useRef<string[]>([]);
  const lock = useRef(false);
  const joined = useRef(false);
  const alive = useRef(true);
  const nameInput = useRef<TextInput>(null);
  const peer = !ispublic && selected.length === 1 ? profiles.find((user) => user.hash === selected[0]) : undefined;
  const direct = !!peer;
  const title = peer ? personName(peer) : name.trim();

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const loadProfiles = useCallback(() => {
    return getProfiles(false).then((result) => {
      if (alive.current) setProfiles(result.filter((user) => user.hash !== session.hash));
    }).catch((failure) => {
      if (alive.current) { onError(failure, session.token); setProfileError(errorText(failure)); }
    }).finally(() => { if (alive.current) setLoading(false); });
  }, [onError, session.hash, session.token]);
  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  async function submit() {
    if (lock.current) return;
    if (chatid.current === null && title.length < 2) {
      setNameError('Bitte gib mindestens 2 Zeichen ein.');
      nameInput.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // Keep the created id and only retry remaining invitations after a partial failure.
      if (chatid.current === null) {
        chatid.current = await create(title, ispublic, direct);
        pending.current = [...selected];
        if (alive.current) setCreated(true);
      }
      if (!joined.current) {
        await join(chatid.current);
        joined.current = true;
      }
      while (pending.current.length) {
        await invite(chatid.current, pending.current[0], false);
        const invited = profiles.find((user) => user.hash === pending.current[0]);
        if (invited && alive.current) onInviteSent(chatid.current, invited);
        pending.current.shift();
      }
      if (alive.current) onCreated(chatid.current);
    } catch (failure) {
      if (alive.current) {
        onError(failure, session.token);
        setError(chatid.current === null ? errorText(failure)
          : !joined.current ? `Der Chat wurde erstellt, konnte aber noch nicht geöffnet werden. ${errorText(failure)}`
            : `Der Chat wurde erstellt. ${pending.current.length} Einladung(en) konnten noch nicht gesendet werden. ${errorText(failure)}`);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const matches = profiles.filter((user) => `${decodeText(user.nickname)} ${decodeText(user.fullname)} ${user.userid}`
    .toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE')));
  const frozen = busy || created;
  const close = () => { if (chatid.current !== null) onCreated(chatid.current); else onClose(); };

  return <Modal visible transparent animationType="none" onRequestClose={() => { if (!lock.current) close(); }}
    onShow={() => nameInput.current?.focus()}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View accessibilityViewIsModal accessibilityLabel="Neuer Chat" style={styles.panel}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Neuer Chat</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dialog schließen" disabled={busy} onPress={close} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {direct ? <View style={styles.section}><Text style={styles.label}>Direktes Gespräch mit</Text>
            <Text style={styles.title}>{title}</Text><Text style={styles.hint}>Der Name wird automatisch übernommen. Du kannst deinen Anzeigenamen für den Chat später ändern.</Text></View>
            : <Field ref={nameInput} label="Chatname" required hint="Für Gruppen oder Chats ohne ausgewählte Person. Mindestens 2 Zeichen." error={nameError}
            placeholder="Zum Beispiel: Lerngruppe" value={name} editable={!frozen}
            onChangeText={(value) => { setName(value); setNameError(''); }} />}
          <View style={styles.section}>
            <Text style={styles.label}>Wer darf beitreten?</Text>
            <View style={styles.options}>
              {[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="radio"
                {...(Platform.OS === 'web' ? { 'aria-checked': ispublic === value } : {})}
                accessibilityState={{ checked: ispublic === value, disabled: frozen }} disabled={frozen} onPress={() => setPublic(value)}
                style={[styles.option, ispublic === value && styles.optionSelected]}>
                <Text style={[styles.optionText, ispublic === value && { color: palette.green }]}>{ispublic === value ? '● ' : '○ '}{value ? 'Öffentlich' : 'Privat'}</Text>
              </Pressable>)}
            </View>
            <Text style={styles.hint}>{ispublic ? 'Alle angemeldeten Personen sehen den Chat und können beitreten.' : 'Nur du und eingeladene Personen haben Zugriff.'}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Personen einladen · optional ({selected.length})</Text>
            <Text style={styles.hint}>Ausgewählte Personen erhalten beim Erstellen eine Einladung.</Text>
            {loading ? <View style={styles.loading}><ActivityIndicator color={palette.green} /><Text accessibilityLiveRegion="polite" style={styles.hint}>Personen werden geladen …</Text></View>
              : profileError ? <ErrorBanner text={profileError} onRetry={() => { setLoading(true); setProfileError(''); void loadProfiles(); }} />
                : profiles.length ? <>
                  <Field label="Personen suchen" placeholder="Name oder Kennung" value={search} onChangeText={setSearch} editable={!frozen} />
                  <ScrollView style={styles.people} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {matches.map((user) => {
                      const checked = selected.includes(user.hash);
                      return <Pressable key={user.hash} accessibilityRole="checkbox"
                        accessibilityLabel={`${decodeText(user.nickname || user.fullname)} einladen`}
                        {...(Platform.OS === 'web' ? { 'aria-checked': checked } : {})}
                        accessibilityState={{ checked, disabled: frozen }} disabled={frozen}
                        onPress={() => setSelected((current) => checked ? current.filter((hash) => hash !== user.hash) : [...current, user.hash])}
                        style={[styles.person, checked && styles.personSelected]}>
                        <Avatar name={decodeText(user.nickname || user.fullname)} size={36} />
                        <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.personName}>{decodeText(user.nickname || user.fullname)}</Text>
                          <Text style={styles.hint}>{decodeText(user.fullname)} · @{user.userid}</Text></View>
                        <Text aria-hidden style={styles.check}>{checked ? '☑' : '□'}</Text>
                      </Pressable>;
                    })}
                    {!matches.length && <Text style={styles.hint}>Keine Person passt zu deiner Suche.</Text>}
                  </ScrollView>
                </> : <Text style={styles.hint}>Es sind noch keine anderen Personen registriert. Du kannst den Chat trotzdem erstellen.</Text>}
          </View>
          <ErrorBanner text={error} />
        </ScrollView>
        <View style={styles.actions}>
          <Button busy={busy} busyLabel={created ? 'Einladungen werden gesendet …' : 'Chat wird erstellt …'} onPress={() => void submit()}>
            {created ? 'Erneut versuchen' : 'Chat erstellen'}
          </Button>
          <Button secondary disabled={busy} onPress={close}>{created ? 'Chat öffnen' : 'Abbrechen'}</Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,62,50,0.35)', padding: 16, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '95%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.soft },
  closeText: { fontSize: 28, color: palette.green },
  content: { padding: 20, gap: 24 },
  section: { gap: 10 },
  label: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  options: { flexDirection: 'row', gap: 10 },
  option: { flex: 1, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: palette.inputBorder, backgroundColor: palette.soft },
  optionSelected: { backgroundColor: palette.mint, borderColor: palette.green },
  optionText: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  people: { maxHeight: 180 },
  person: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, marginBottom: 4 },
  personSelected: { backgroundColor: palette.mint },
  personName: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  check: { color: palette.green, fontSize: 24 },
  actions: { gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: palette.line },
});
