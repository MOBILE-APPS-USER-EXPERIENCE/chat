import { AlertDialog, Button, Text, XStack, YStack } from 'tamagui';

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
    return (
        <AlertDialog open={visible} onOpenChange={(open) => !open && onCancel()}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay
                    key="overlay"
                    backgroundColor="rgba(0, 0, 0, 0.5)"
                />
                <AlertDialog.Content
                    bordered
                    elevate
                    key="content"
                    backgroundColor="background"
                    gap={8}
                    p={24}
                    w="90%"
                >
                    <YStack gap={8}>
                        <AlertDialog.Title asChild>
                            <Text fontSize={24} fontWeight="600">{title}</Text>
                        </AlertDialog.Title>
                        <AlertDialog.Description asChild>
                            <Text color="textSecondary">{message}</Text>
                        </AlertDialog.Description>
                    </YStack>

                    <XStack justify="flex-end" gap={8} mt={8}>
                        <AlertDialog.Cancel asChild>
                            <Button onPress={onCancel}>{cancelLabel}</Button>
                        </AlertDialog.Cancel>
                        {destructive ? (
                            <AlertDialog.Destructive asChild>
                                <Button backgroundColor="error" color="errorText" onPress={onConfirm}>
                                    {confirmLabel}
                                </Button>
                            </AlertDialog.Destructive>
                        ) : (
                            <AlertDialog.Action asChild>
                                <Button onPress={onConfirm}>{confirmLabel}</Button>
                            </AlertDialog.Action>
                        )}
                    </XStack>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog>
    );
}

export default ConfirmDialog;
