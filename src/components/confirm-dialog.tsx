import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Modal, StyleSheet, View } from 'react-native';

import { Button, Host, Text } from '@expo/ui';

function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Löschen',
    cancelLabel = 'Abbrechen',
    destructive = true,
    onConfirm,
    onCancel,
}: Readonly<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}>) {
    const theme = useTheme();

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
            <View style={styles.overlay}>
                <View style={[styles.dialog, { backgroundColor: theme.background }]}>
                    <Text>{title}</Text>
                    <Text>{message}</Text>

                    <Host style={styles.actions}>
                        <Button
                            onPress={onCancel}>
                            <Text>{cancelLabel}</Text>
                        </Button>

                        <Button
                            onPress={onConfirm}>
                            <Text>{confirmLabel}</Text>
                        </Button>
                    </Host>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.four,
    },
    dialog: {
        borderRadius: Spacing.two,
        padding: Spacing.four,
        width: '100%',
        maxWidth: 400,
        gap: Spacing.two,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.two,
        marginTop: Spacing.two,
    },
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        minHeight: 44,
    },
    pressed: {
        opacity: 0.7,
    },
});

export default ConfirmDialog;
