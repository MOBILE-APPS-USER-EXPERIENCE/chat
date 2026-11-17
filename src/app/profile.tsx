import { deregister, logout } from '@/api/authService';
import ConfirmDialog from '@/components/confirm-dialog';
import { router } from 'expo-router';
import { useState } from 'react';
import { Button, H2, YStack } from 'tamagui';


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
        <YStack flex={1} items="center" justify="center" gap={8} backgroundColor="background">
            <H2>Profil</H2>

            <Button onPress={handleLogout}>Logout</Button>

            <Button onPress={() => void 0}>test</Button>

            <Button
                backgroundColor="error"
                color="errorText"
                onPress={() => setDialogVisible(true)}>
                Account löschen
            </Button>
            <ConfirmDialog
                visible={dialogVisible}
                title="Account löschen"
                message="Bist du sicher?"
                onConfirm={confirmDeleteAccount}
                onCancel={() => setDialogVisible(false)}
            />
        </YStack>
    );
}
