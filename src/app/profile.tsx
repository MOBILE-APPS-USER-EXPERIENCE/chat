import ConfirmDialog from '@/components/confirm-dialog';
import { session } from '@/session';
import { describeAuthError } from '@/utils/auth-error';
import { useState } from 'react';
import { Button, H2, Text, YStack } from 'tamagui';

import { triggerPrimaryButtonHaptic } from '@/utils/primary-button-haptic';

export default function ProfileScreen() {
    const [dialogVisible, setDialogVisible] = useState(false);
    const [error, setError] = useState<string>();

    async function handleLogout() {
        setError(undefined);
        try {
            await session.logout();
        } catch (caughtError) {
            setError(describeAuthError(caughtError, 'Logout fehlgeschlagen.'));
        }
    }

    async function confirmDeleteAccount() {
        setDialogVisible(false);
        setError(undefined);
        try {
            await session.deregister();
        } catch (caughtError) {
            setError(describeAuthError(caughtError, 'Account konnte nicht gelöscht werden.'));
        }
    }

    return (
        <YStack flex={1} items="center" justify="center" gap={8} backgroundColor="background">
            <H2>Profil</H2>

            <Button
                onPress={() => {
                    triggerPrimaryButtonHaptic();
                    void handleLogout();
                }}>
                Logout
            </Button>

            <Button onPress={() => void 0}>test</Button>

            <Button
                backgroundColor="error"
                color="errorText"
                onPress={() => {
                    triggerPrimaryButtonHaptic();
                    setDialogVisible(true);
                }}>
                Account löschen
            </Button>
            {!!error && <Text color="error">{error}</Text>}
            <ConfirmDialog
                visible={dialogVisible}
                title="Account löschen"
                message="Bist du sicher?"
                onConfirm={() => void confirmDeleteAccount()}
                onCancel={() => setDialogVisible(false)}
            />
        </YStack>
    );
}
