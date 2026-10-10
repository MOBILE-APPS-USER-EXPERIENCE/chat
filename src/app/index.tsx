import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthScreen } from '@/features/chat/auth-screen';
import { ChatWorkspace } from '@/features/chat/chat-workspace';
import { palette } from '@/features/chat/ui';
import { useSession } from '@/features/chat/use-session';

export default function HomeScreen() {
  const auth = useSession();
  return <SafeAreaView style={styles.page}>
    {auth.restoring ? <View style={styles.loading}><ActivityIndicator color={palette.green} /><Text style={styles.loadingText}>Deine Sitzung wird geladen …</Text></View>
      : auth.session ? <ChatWorkspace key={auth.session.token} session={auth.session} busy={auth.busy} signOut={auth.signOut} handleError={auth.handleError} />
        : <AuthScreen busy={auth.busy} notice={auth.notice} authenticate={auth.authenticate} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  loadingText: { fontSize: 13, color: palette.muted },
});
