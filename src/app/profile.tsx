import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { deregister, logout } from '@/api/authService';
import ConfirmDialog from '@/components/confirm-dialog';
import { router } from 'expo-router';
import { useState } from 'react';

import { ThemedButton } from '@/components/themed-button/themed-button';
import { Button, Host, Text } from '@expo/ui';


function handleLogout() {
    logout();
    router.replace('/(auth)/login');
}

export default function ProfileScreen() {
    const [dialogVisible, setDialogVisible] = useState(false);

    function confirmDeleteAccount() {
        setDialogVisible(false);
        deregister();
        router.replace('/(auth)/login');
    }

    return (
        <ThemedView style={styles.container}>
            <Host>
                <ThemedText type="subtitle">Profil</ThemedText>

                <Button
                    onPress={handleLogout}>
                    <Text>Logout</Text>
                </Button>

                <ThemedButton title="test" onPress={() => void 0}></ThemedButton>

                <ThemedButton
                    title="Account löschen"
                    onPress={() => setDialogVisible(true)}
                    style="destructive"
                />
                <ConfirmDialog
                    visible={dialogVisible}
                    title="Account löschen"
                    message="Bist du sicher?"
                    onConfirm={confirmDeleteAccount}
                    onCancel={() => setDialogVisible(false)}
                />

            </Host>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
