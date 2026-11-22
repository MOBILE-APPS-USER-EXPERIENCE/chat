import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';

import type { Chat, Message } from '@/api/types';

import { decodeText, errorText, messageDay, messageTime } from './format';
import { Avatar, Button, ErrorBanner, palette } from './ui';
import { NewChatForm } from './new-chat-form';
import { ChatDetails } from './chat-details';
import { chatTitle } from './chat-title';
import { useChatNames } from './use-chat-names';
import { useChats } from './use-chats';
import type { Session } from './use-session';

type Props = {
  session: Session; busy: boolean; signOut: () => Promise<void>;
  handleError: (error: unknown, token: string) => void;
};

export function ChatWorkspace({ session, busy, signOut, handleError }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const data = useChats(session, handleError);
  const names = useChatNames(session.hash);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'joined'>('all');
  const [logoutError, setLogoutError] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newestChatId, setNewestChatId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const chats = data.chats.filter((chat) => (filter === 'all' || chat.joined)
    && chatTitle(chat, session.hash, names.names).toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE')))
    .sort((a, b) => Number(b.chatid === newestChatId) - Number(a.chatid === newestChatId));
  const name = session.nickname || session.userid;

  async function logout() {
    setLogoutError('');
    try { await signOut(); } catch (error) { setLogoutError(errorText(error)); }
  }

  return <View style={[styles.page, !wide && styles.pageMobile]}>
    <View style={[styles.workspace, !wide && styles.workspaceMobile]}>
      {(wide || !data.selected) && <View style={[styles.sidebar, !wide && styles.sidebarMobile]}>
        <View style={styles.brandRow}>
          <View style={styles.brand}><View style={styles.brandIcon}><Text style={styles.brandGlyph}>c.</Text></View><Text style={styles.brandName}>chat</Text></View>
          <View style={styles.activeBadge}><View style={styles.dot} /><Text style={styles.activeLabel}>Angemeldet</Text></View>
        </View>
        <View style={styles.listHeading}>
          <Text accessibilityRole="header" style={styles.heading}>Gespräche<Text style={styles.count}>  {data.chats.length}</Text></Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Chatliste aktualisieren" accessibilityState={{ busy: data.listLoading, disabled: data.listLoading }} disabled={data.listLoading}
            onPress={() => void data.refreshChats()} style={styles.iconButton}>
            {data.listLoading ? <ActivityIndicator size="small" color={palette.green} /> : <Text style={styles.refresh}>↻</Text>}
          </Pressable>
        </View>
        <View style={styles.newChat}><Button onPress={() => setNewChatOpen(true)}>＋ Neuer Chat</Button></View>
        <View nativeID="chat-search-box" style={[styles.searchBox, searchFocused && styles.searchFocused]}>
          <Text aria-hidden style={styles.searchIcon}>⌕</Text>
          <TextInput accessibilityLabel="Chats suchen" placeholder="Gespräch suchen" placeholderTextColor={palette.muted}
            value={search} onChangeText={setSearch} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={styles.searchInput} />
          {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={() => setSearch('')} style={styles.clearSearch}><Text style={{ color: palette.muted, fontSize: 24 }}>×</Text></Pressable>}
        </View>
        <View style={styles.filters}>
          {(['all', 'joined'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={Platform.OS === 'web' ? undefined : { selected: filter === value }}
            {...(Platform.OS === 'web' ? { 'aria-pressed': filter === value } : {})}
            onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && { color: palette.green }]}>{value === 'all' ? 'Alle Chats' : 'Meine Chats'}</Text>
          </Pressable>)}
        </View>
        {!!search && <Text accessibilityLiveRegion="polite" style={styles.searchStatus}>{chats.length} {chats.length === 1 ? 'Gespräch gefunden' : 'Gespräche gefunden'}</Text>}
        {!!data.listError && <View style={styles.listError}><ErrorBanner text={data.listError} onRetry={() => void data.refreshChats()} /></View>}
        <FlatList data={chats} keyExtractor={(chat) => String(chat.chatid)} style={styles.chatList}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          ListEmptyComponent={!data.listLoading && !data.listError ? <View style={styles.listEmpty}>
            <Text style={styles.listEmptyText}>{search ? 'Kein Gespräch passt zu deiner Suche.' : filter === 'joined' ? 'Du bist noch keinem dieser Chats beigetreten.' : 'Hier sind noch keine Chats. Aktualisiere die Liste, um erneut nachzusehen.'}</Text>
            {(search || filter === 'joined') && <Button secondary onPress={() => { setSearch(''); setFilter('all'); }}>Alle Chats anzeigen</Button>}
          </View> : data.listLoading && !data.chats.length ? <Text accessibilityLiveRegion="polite" style={styles.listEmptyText}>Chats werden geladen …</Text> : null}
          renderItem={({ item: chat }) => <ChatRow chat={chat} title={chatTitle(chat, session.hash, names.names)} active={chat.chatid === data.selectedId}
            lastMessage={data.messages[chat.chatid]?.at(-1)} onPress={() => data.selectChat(chat.chatid)} />} />
        <View style={styles.account}>
          <Text style={styles.accountEyebrow}>EINGELOGGT ALS</Text>
          <View style={styles.accountRow}>
            <Avatar name={name} size={38} />
            <View style={styles.accountInfo}>
              <Text numberOfLines={1} style={styles.accountName}>{decodeText(name)}</Text>
              {!!session.fullname && <Text numberOfLines={1} style={styles.accountFullname}>{decodeText(session.fullname)}</Text>}
              <Text selectable style={styles.accountId}>@{session.userid}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Abmelden" disabled={busy} onPress={() => void logout()} style={styles.logout}>
              {busy ? <ActivityIndicator color={palette.green} /> : <Text style={styles.logoutText}>Abmelden</Text>}
            </Pressable>
          </View>
          <SessionToken token={session.token} />
          <ErrorBanner text={logoutError} />
        </View>
      </View>}
      {(wide || data.selected) && <View style={styles.conversation}>
        {data.selected ? <Conversation key={data.selected.chatid} chat={data.selected} session={session} wide={wide}
          title={chatTitle(data.selected, session.hash, names.names)} defaultTitle={chatTitle(data.selected, session.hash)}
          namesReady={names.ready} namesError={names.error} rename={names.rename}
          messages={data.messages[data.selected.chatid] ?? []} loading={data.messageLoading} error={data.messageError}
          sending={data.sendingChats[data.selected.chatid] ?? false}
          draft={drafts[data.selected.chatid] ?? ''}
          onDraftChange={(text) => setDrafts((current) => ({ ...current, [data.selected!.chatid]: text }))}
          onDraftSent={(sentDraft) => setDrafts((current) => current[data.selected!.chatid] === sentDraft
            ? { ...current, [data.selected!.chatid]: '' } : current)}
          onBack={() => data.selectChat(null)} onRefresh={data.refreshMessages} send={data.send} join={data.join} />
          : <View style={styles.welcome}>
            <View style={styles.welcomeIcon}><Text style={styles.welcomeGlyph}>c.</Text></View>
            <Text style={styles.welcomeEyebrow}>GUT, DASS DU DA BIST</Text>
            <Text style={styles.welcomeTitle}>Hallo, {decodeText(name)}.</Text>
            <Text style={styles.welcomeText}>Wähle links ein Gespräch aus.{ '\n' }Hier ist Platz für eure nächsten Nachrichten.</Text>
            <View style={styles.welcomeLine} />
            <Text style={styles.welcomeFootnote}>Verbunden mit dem Chatserver der Hochschule Esslingen</Text>
          </View>}
      </View>}
    </View>
    {wide && <Text style={styles.footer}>Einfach schreiben. In Verbindung bleiben.</Text>}
    {newChatOpen && <NewChatForm session={session} create={data.create} join={data.join} onInviteSent={data.invitationSent}
      onError={handleError} onClose={() => setNewChatOpen(false)}
      onCreated={(chatid) => { setSearch(''); setFilter('all'); setNewestChatId(chatid); data.openCreated(chatid); setNewChatOpen(false); }} />}
  </View>;
}

function SessionToken({ token }: { token: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const visible = revealed === token;
  return <View style={styles.tokenBox}>
    <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Token verbergen' : 'Token anzeigen'}
      {...(Platform.OS === 'web' ? { 'aria-expanded': visible } : {})}
      accessibilityState={{ expanded: visible }} onPress={() => setRevealed(visible ? null : token)} style={styles.tokenRow}>
      <Text style={styles.tokenLabel}>Sitzungs-Token</Text>
      <Text style={styles.tokenAction}>{visible ? 'Verbergen' : 'Anzeigen'}</Text>
    </Pressable>
    {visible && <Text selectable style={styles.token}>{token}</Text>}
  </View>;
}

function ChatRow({ chat, title, active, lastMessage, onPress }: { chat: Chat; title: string; active: boolean; lastMessage?: Message; onPress: () => void }) {
  const preview = lastMessage
    ? `${decodeText(lastMessage.usernick || lastMessage.userfullname || 'Nachricht')}: ${decodeText(lastMessage.text) || 'Anhang'}`
    : chat.chatid === 0 ? 'Ein Gespräch für alle'
      : !chat.joined ? chat.role === 'invited' ? 'Du bist eingeladen' : 'Öffentlicher Chat · Beitreten'
        : chat.directchat ? 'Direktes Gespräch' : `${chat.participants?.length ?? 0} ${(chat.participants?.length ?? 0) === 1 ? 'Mitglied' : 'Mitglieder'}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Chat ${title} öffnen`}
    accessibilityState={Platform.OS === 'web' ? undefined : { selected: active }}
    {...(Platform.OS === 'web' ? { 'aria-current': active ? 'true' : undefined } : {})} onPress={onPress}
    style={({ pressed }) => [styles.chatRow, active && styles.chatRowActive, pressed && { opacity: 0.75 }]}>
    <Avatar name={title} />
    <View style={styles.chatRowCopy}>
      <View style={styles.chatRowTop}><Text numberOfLines={1} style={styles.chatRowName}>{title}</Text>
        {lastMessage && <Text style={styles.chatRowTime}>{messageTime(lastMessage.time)}</Text>}</View>
      <Text numberOfLines={1} style={styles.chatRowPreview}>{preview}</Text>
    </View>
    {active && <Text style={styles.selectedLabel}>Geöffnet</Text>}
  </Pressable>;
}

type ConversationProps = {
  title: string; defaultTitle: string; namesReady: boolean; namesError: string; rename: (chatid: number, name?: string) => Promise<void>;
  chat: Chat; session: Session; wide: boolean; messages: Message[]; loading: boolean; error: string;
  draft: string; sending: boolean; onDraftChange: (text: string) => void; onDraftSent: (sentDraft: string) => void;
  onBack: () => void; onRefresh: () => void;
  send: (chatid: number, text: string) => Promise<boolean>; join: (chatid: number) => Promise<void>;
};

function Conversation({ chat, title, defaultTitle, namesReady, namesError, rename, session, wide, messages, loading, error, draft, sending, onDraftChange, onDraftSent, onBack, onRefresh, send, join }: ConversationProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sendNotice, setSendNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const list = useRef<FlatList<Message>>(null);
  const nearBottom = useRef(true);

  async function submit() {
    const text = draft.trim();
    if (!text || sending || !chat.joined) return;
    setActionError('');
    setSendNotice('');
    try {
      if (await send(chat.chatid, text)) {
        onDraftSent(draft);
        nearBottom.current = true;
        if (mounted.current) setSendNotice('Nachricht gesendet.');
      }
    } catch (failure) {
      if (mounted.current) setActionError(errorText(failure));
    }
  }

  async function joinSelected() {
    if (joining) return;
    setJoining(true);
    setActionError('');
    try { await join(chat.chatid); } catch (failure) { if (mounted.current) setActionError(errorText(failure)); }
    finally { if (mounted.current) setJoining(false); }
  }

  const subtitle = chat.chatid === 0 ? 'Öffentlich · Für alle Mitglieder'
    : `${chat.participants?.length ?? 0} ${(chat.participants?.length ?? 0) === 1 ? 'Mitglied' : 'Mitglieder'}${chat.invited?.length ? ` · ${chat.invited.length} eingeladen` : ''} · ${chat.directchat ? 'Direktes Gespräch' : chat.visibility === 'private' ? 'Privater Chat' : 'Öffentlicher Chat'}`;

  return <KeyboardAvoidingView style={styles.conversation} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.conversationHeader}>
      {!wide && <Pressable accessibilityRole="button" accessibilityLabel="Zurück zur Chatliste" onPress={onBack} style={styles.back}><Text style={styles.backArrow}>‹</Text><Text style={styles.backText}>Chats</Text></Pressable>}
      <Avatar name={title} size={42} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Teilnehmer und Chatdetails zu ${title} anzeigen`} onPress={() => setDetailsOpen(true)}
        style={{ flex: 1, minWidth: 0, gap: 4, minHeight: 48, justifyContent: 'center', borderRadius: 8 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.conversationTitle}>{title}</Text><Text style={styles.conversationSubtitle}>{subtitle}</Text>
        <Text style={{ color: palette.green, fontSize: 13, fontWeight: '600' }}>Teilnehmer anzeigen ›</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Nachrichten aktualisieren" onPress={onRefresh} style={styles.iconButton}><Text style={styles.refresh}>↻</Text></Pressable>
    </View>
    {!!(error || actionError) && <View style={styles.messageError}><ErrorBanner text={actionError || error} onRetry={actionError ? undefined : onRefresh} />
      {!!actionError && <Text style={styles.recoveryHint}>Dein Text bleibt erhalten. Versuche es erneut mit „Senden“.</Text>}
    </View>}
    {!chat.joined ? <View style={styles.welcome}>
      <Avatar name={title} size={72} />
      <Text style={styles.joinTitle}>{chat.role === 'invited' ? 'Du bist eingeladen.' : 'Komm ins Gespräch.'}</Text>
      <Text style={styles.welcomeText}>Tritt diesem Chat bei, um Nachrichten zu lesen und selbst zu schreiben.</Text>
      <Button busy={joining} busyLabel="Chat wird geöffnet …" onPress={() => void joinSelected()}>Chat beitreten</Button>
    </View> : <>
      <FlatList ref={list} data={messages} keyExtractor={(message) => String(message.id)} style={styles.messageList}
        contentContainerStyle={[styles.messagesContent, !wide && { paddingHorizontal: 16 }]}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          nearBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
        }} scrollEventThrottle={100}
        onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
        ListEmptyComponent={<View style={styles.emptyConversation}>{loading ? <View style={{ gap: 12 }}><ActivityIndicator color={palette.green} /><Text accessibilityLiveRegion="polite" style={styles.welcomeText}>Nachrichten werden geladen …</Text></View> : error ? null : <>
          <Text style={styles.joinTitle}>Der Anfang eines Gesprächs.</Text><Text style={styles.welcomeText}>Hier gibt es noch keine Nachrichten. Schreib das erste Hallo.</Text>
        </>}</View>}
        renderItem={({ item, index }) => {
          const own = item.userhash === session.hash || (!!item.userid && item.userid === session.userid);
          const newDay = index === 0 || messageDay(messages[index - 1].time) !== messageDay(item.time);
          return <View>
            {newDay && <View style={styles.dayRow}><View style={styles.dayLine} /><Text style={styles.dayLabel}>{messageDay(item.time)}</Text><View style={styles.dayLine} /></View>}
            <View style={[styles.messageRow, own && styles.messageRowOwn]}>
              {!own && <Avatar name={item.usernick || item.userfullname || item.userid} size={28} />}
              <View style={[styles.bubble, own && styles.ownBubble]}>
                <Text style={[styles.sender, own && { color: '#416849' }]}>{own ? 'Du' : decodeText(item.usernick || item.userfullname || item.userid || 'Unbekannt')}
                  {!own && item.userfullname && item.userfullname !== item.usernick && <Text style={styles.senderFullname}> · {decodeText(item.userfullname)}</Text>}</Text>
                {!!item.text && <Text selectable style={styles.messageText}>{decodeText(item.text)}</Text>}
                {!!item.photoid && <Text style={styles.attachment}>▧ Foto</Text>}
                {!!item.fileid && <Text style={styles.attachment}>↳ Datei</Text>}
                {!!item.position && <Text selectable style={styles.attachment}>Standort: {item.position}</Text>}
                <View style={styles.messageMeta}>{item.important && <Text style={styles.important}>Wichtig</Text>}
                  <Text style={styles.messageTime}>{messageTime(item.time)}</Text>{own && <Text accessibilityLabel="Vom Server gespeichert" style={styles.messageCheck}>✓</Text>}
                </View>
              </View>
            </View>
          </View>;
        }} />
      <View style={[styles.composerArea, !wide && { paddingHorizontal: 16 }]}>
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Nachricht" accessibilityHint={Platform.OS === 'web' ? 'Enter sendet. Umschalt und Enter fügt einen Zeilenumbruch ein.' : 'Schreibe deinen Text und wähle Senden.'}
            placeholder="Schreib eine Nachricht …" placeholderTextColor={palette.muted}
            value={draft} onChangeText={(text) => { onDraftChange(text); setSendNotice(''); }} editable={!sending} multiline submitBehavior="submit"
            onKeyPress={(event) => {
              if (Platform.OS !== 'web') return;
              const key = event as unknown as { key: string; shiftKey: boolean; nativeEvent: { isComposing?: boolean }; preventDefault: () => void };
              if (key.key === 'Enter' && !key.shiftKey && !key.nativeEvent.isComposing) {
                key.preventDefault();
                void submit();
              }
            }}
            onSubmitEditing={() => void submit()} style={styles.composerInput} maxLength={10000} />
          <Pressable accessibilityRole="button" accessibilityLabel="Nachricht senden" accessibilityState={{ disabled: sending || !draft.trim(), busy: sending }}
            disabled={sending || !draft.trim()} onPress={() => void submit()}
            style={({ pressed }) => [styles.sendButton, !draft.trim() && { backgroundColor: '#DBE5DC' }, pressed && { opacity: 0.7 }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.sendLabel, !draft.trim() && { color: palette.muted }]}>Senden</Text>}
          </Pressable>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.sendStatus}>{sending ? 'Nachricht wird gesendet …' : sendNotice || 'Automatische Aktualisierung alle 5 Sekunden.'}</Text>
        {Platform.OS === 'web' && <Text style={styles.composerHint}>Enter: senden · Umschalt + Enter: neue Zeile</Text>}
      </View>
    </>}
    {detailsOpen && <ChatDetails chat={chat} title={title} defaultTitle={defaultTitle} ownHash={session.hash}
      namesReady={namesReady} namesError={namesError} rename={rename} onClose={() => setDetailsOpen(false)} />}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas, padding: 24, paddingBottom: 12, gap: 12 },
  pageMobile: { padding: 0, gap: 0 },
  workspace: { flex: 1, width: '100%', maxWidth: 1440, alignSelf: 'center', flexDirection: 'row', borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line, boxShadow: '0 10px 50px rgba(18,62,50,0.05)' },
  workspaceMobile: { borderRadius: 0, borderWidth: 0 },
  sidebar: { width: 360, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: palette.line },
  sidebarMobile: { width: '100%', borderRightWidth: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.dark, alignItems: 'center', justifyContent: 'center' },
  brandGlyph: { fontSize: 23, fontWeight: '800', color: '#E1ECD8', marginTop: -5 },
  brandName: { fontSize: 24, color: palette.dark, fontWeight: '600', letterSpacing: -1 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, backgroundColor: palette.soft, paddingVertical: 6, paddingHorizontal: 9 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.green },
  activeLabel: { color: palette.green, fontSize: 12, fontWeight: '600' },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 14 },
  heading: { color: palette.ink, fontSize: 23, fontWeight: '600', letterSpacing: -0.7 },
  count: { fontSize: 14, color: palette.muted, fontWeight: '400' },
  iconButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.soft, alignItems: 'center', justifyContent: 'center' },
  refresh: { color: palette.green, fontSize: 22 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.inputBorder, borderRadius: 10, paddingLeft: 12, paddingRight: 4, gap: 7, minHeight: 52 },
  searchFocused: { borderColor: palette.green },
  newChat: { paddingHorizontal: 24, paddingBottom: 14 },
  searchIcon: { fontSize: 22, color: palette.muted },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: palette.ink, minHeight: 48, borderRadius: 6 },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  searchStatus: { color: palette.muted, fontSize: 13, paddingHorizontal: 24, marginBottom: 12 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingVertical: 18 },
  filter: { paddingHorizontal: 12, paddingVertical: 9, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.soft, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  filterActive: { backgroundColor: palette.mint, borderBottomColor: palette.green },
  filterText: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  listError: { paddingHorizontal: 16, marginBottom: 12 },
  chatList: { flex: 1 },
  listEmpty: { padding: 16, gap: 16 },
  listEmptyText: { color: palette.muted, fontSize: 14, lineHeight: 22 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 12, minHeight: 84, borderRadius: 12, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  chatRowActive: { backgroundColor: '#EEF4EC', borderLeftColor: palette.green },
  chatRowCopy: { flex: 1, gap: 7 },
  chatRowTop: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatRowName: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '600' },
  chatRowTime: { color: palette.muted, fontSize: 12 },
  chatRowPreview: { color: palette.muted, fontSize: 14 },
  selectedLabel: { color: palette.green, fontSize: 12, fontWeight: '600' },
  account: { padding: 20, borderTopWidth: 1, borderTopColor: palette.line, gap: 12, backgroundColor: '#FCFDFB' },
  accountEyebrow: { color: palette.muted, fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  accountRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  accountInfo: { flex: 1, gap: 3 },
  accountName: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  accountFullname: { color: palette.muted, fontSize: 13 },
  accountId: { color: palette.muted, fontSize: 13 },
  logout: { minHeight: 44, minWidth: 80, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingHorizontal: 4 },
  logoutText: { color: palette.green, fontSize: 14, fontWeight: '600' },
  tokenBox: { backgroundColor: '#F0F4EE', borderRadius: 8 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 10, borderRadius: 8, gap: 8 },
  tokenAction: { color: palette.green, fontSize: 14, fontWeight: '600' },
  tokenLabel: { color: palette.muted, fontSize: 13 },
  token: { color: palette.green, fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingHorizontal: 10, paddingBottom: 12 },
  conversation: { flex: 1, minWidth: 0, backgroundColor: '#F4F5EF' },
  welcome: { flex: 1, padding: 36, alignItems: 'center', justifyContent: 'center', gap: 20 },
  welcomeIcon: { width: 84, height: 84, backgroundColor: '#E0E9D9', borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  welcomeGlyph: { color: '#6A8B6D', fontSize: 58, fontWeight: '600', marginTop: -10 },
  welcomeEyebrow: { color: palette.muted, fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },
  welcomeTitle: { color: palette.ink, fontSize: 30, fontWeight: '500', letterSpacing: -1, textAlign: 'center' },
  welcomeText: { color: palette.muted, fontSize: 16, lineHeight: 25, textAlign: 'center', maxWidth: 360 },
  welcomeLine: { width: 40, height: 2, backgroundColor: '#CAD9C5', marginTop: 20 },
  welcomeFootnote: { color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  conversationHeader: { backgroundColor: '#FCFDFB', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  conversationTitle: { color: palette.ink, fontSize: 18, fontWeight: '600' },
  conversationSubtitle: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  back: { minWidth: 64, minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  backArrow: { fontSize: 30, color: palette.green },
  backText: { color: palette.green, fontSize: 14, fontWeight: '600' },
  messageError: { paddingHorizontal: 20, paddingTop: 12 },
  messageList: { flex: 1 },
  messagesContent: { paddingHorizontal: 32, paddingVertical: 20, flexGrow: 1, justifyContent: 'flex-end' },
  emptyConversation: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15, minHeight: 240 },
  joinTitle: { fontSize: 20, color: palette.ink, fontWeight: '500', textAlign: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 20 },
  dayLine: { flex: 1, height: 1, backgroundColor: '#E1E5DA' },
  dayLabel: { fontSize: 13, color: palette.muted },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 15 },
  messageRowOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 14, borderBottomLeftRadius: 3, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 9, gap: 7, borderWidth: 1, borderColor: '#E9ECE3' },
  ownBubble: { backgroundColor: '#DFEDD2', borderColor: '#DFEDD2', borderBottomLeftRadius: 14, borderBottomRightRadius: 3 },
  sender: { fontSize: 13, color: palette.green, fontWeight: '700' },
  senderFullname: { color: palette.muted, fontWeight: '400' },
  messageText: { color: palette.ink, fontSize: 16, lineHeight: 24 },
  attachment: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  messageMeta: { flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'flex-end' },
  important: { color: '#6A5820', fontSize: 12, marginRight: 5 },
  messageTime: { color: palette.muted, fontSize: 12 },
  messageCheck: { color: '#416849', fontSize: 13 },
  composerArea: { padding: 20, paddingHorizontal: 30, backgroundColor: '#F4F5EF', gap: 10 },
  composer: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: palette.inputBorder, borderRadius: 16, alignItems: 'flex-end', padding: 8, gap: 8 },
  composerInput: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 8, color: palette.ink, fontSize: 16 },
  sendButton: { minWidth: 88, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  sendLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sendStatus: { color: palette.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  recoveryHint: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  composerHint: { color: palette.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  footer: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});
