import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Chat, User } from '@/api/types';
import { decodeText } from './format';
import { personName } from './chat-title';
import { Avatar, Button, ErrorBanner, Field, palette } from './ui';

type Props = {
  chat: Chat; title: string; ownHash: string; defaultTitle: string; namesReady: boolean; namesError: string;
  rename: (chatid: number, name?: string) => Promise<void>; onClose: () => void;
};

export function ChatDetails({ chat, title, ownHash, defaultTitle, namesReady, namesError, rename, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<TextInput>(null);
  const lock = useRef(false);
  const members = [...new Map((chat.participants ?? []).map((person) => [person.hash, person])).values()];
  const memberHashes = new Set(members.map((person) => person.hash));
  const invited = [...new Map((chat.invited ?? []).filter((person) => !memberHashes.has(person.hash)).map((person) => [person.hash, person])).values()];

  async function save(reset = false) {
    if (lock.current) return;
    if (!reset && name.trim().length < 2) { setError('Bitte gib mindestens 2 Zeichen ein.'); input.current?.focus(); return; }
    lock.current = true;
    setBusy(true);
    setError('');
    try { await rename(chat.chatid, reset ? undefined : name); setEditing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Der Name konnte nicht gespeichert werden.'); }
    finally { lock.current = false; setBusy(false); }
  }

  function person(user: User, waiting: boolean) {
    const owner = !Array.isArray(chat.owner) && chat.owner.hash === user.hash;
    return <View key={user.hash} style={styles.person}>
      <Avatar name={personName(user)} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.personName}>{personName(user)}{user.hash === ownHash ? ' (Du)' : ''}</Text>
        {!!user.fullname && <Text style={styles.hint}>{decodeText(user.fullname)}</Text>}
        {!!user.userid && <Text selectable style={styles.hint}>@{user.userid}</Text>}
        <Text style={styles.status}>{waiting ? 'Eingeladen · noch nicht beigetreten' : owner ? 'Mitglied · hat den Chat erstellt' : 'Mitglied'}</Text>
      </View>
    </View>;
  }

  return <Modal visible transparent animationType="none" onRequestClose={() => { if (!lock.current) onClose(); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel="Chatdetails" style={styles.panel}>
        <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Chatdetails</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Chatdetails schließen" disabled={busy} onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.chatTitle}>{title}</Text>
          <Text style={styles.hint}>{chat.directchat ? 'Direktes Gespräch' : chat.visibility === 'private' ? 'Privater Gruppenchat' : 'Öffentlicher Chat'}</Text>
          {chat.chatid === 0 ? <Text style={styles.hint}>Der Hauptchat steht allen registrierten Personen offen. Die API liefert dafür keine vollständige Teilnehmerliste.</Text> : <>
            <Text accessibilityRole="header" style={styles.label}>Mitglieder ({members.length})</Text>
            {members.map((user) => person(user, false))}
            {!members.length && <Text style={styles.hint}>Es sind noch keine Mitglieder beigetreten.</Text>}
            {!!invited.length && <><Text accessibilityRole="header" style={styles.label}>Offene Einladungen ({invited.length})</Text>
              {invited.map((user) => person(user, true))}</>}
          </>}
          {chat.chatid !== 0 && <View style={styles.naming}>
            <Text accessibilityRole="header" style={styles.label}>Dein Anzeigename für den Chat</Text>
            <Text style={styles.hint}>Die Änderung wird für dein Konto auf diesem Gerät gespeichert und gilt nur für dich. Die API unterstützt keine gemeinsame Umbenennung.</Text>
            <ErrorBanner text={namesError} />
            {!namesReady && !namesError && <Text accessibilityLiveRegion="polite" style={styles.hint}>Gespeicherte Namen werden geladen …</Text>}
            {editing ? <>
              <Field ref={input} label="Neuer Anzeigename" value={name} onChangeText={(value) => { setName(value); setError(''); }} required
                error={error} hint="Mindestens 2 Zeichen." editable={!busy} autoFocus maxLength={100} />
              <Button busy={busy} busyLabel="Name wird gespeichert …" onPress={() => void save()}>Speichern</Button>
              <Button secondary disabled={busy} onPress={() => { setEditing(false); setError(''); }}>Abbrechen</Button>
            </> : <>
              <ErrorBanner text={error} />
              <Button secondary disabled={!namesReady || busy} onPress={() => { setName(title); setEditing(true); setError(''); }}>Name ändern</Button>
              {title !== defaultTitle && <Button secondary busy={busy} busyLabel="Name wird zurückgesetzt …" disabled={!namesReady} onPress={() => void save(true)}>Standardnamen verwenden</Button>}
            </>}
          </View>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,62,50,0.35)', padding: 16, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.soft },
  closeText: { fontSize: 28, color: palette.green },
  content: { padding: 20, gap: 12 },
  chatTitle: { color: palette.ink, fontSize: 22, fontWeight: '600' },
  label: { color: palette.ink, fontSize: 16, fontWeight: '600', marginTop: 8 },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  person: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: palette.soft, borderRadius: 12, alignItems: 'center' },
  personName: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  status: { color: palette.green, fontSize: 13, lineHeight: 20 },
  naming: { gap: 12, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, marginTop: 8 },
});
