import type { ReactNode } from 'react';
import { Adapt, Button, Dialog, Sheet, Text, XStack, YStack } from 'tamagui';

import { Spacing } from '@/config/layout';
import { triggerPrimaryButtonHaptic } from '@/utils/primary-button-haptic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Löschen',
    cancelLabel = 'Abbrechen',
    destructive = true,
    onConfirm,
    onCancel,
    children,
}: Readonly<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: ReactNode;
}>) {
    const insets = useSafeAreaInsets();
    return (
        <Dialog open={visible} onOpenChange={(open) => !open && onCancel()} modal>
            <Dialog.Portal>
                <Dialog.Overlay
                    key="overlay"
                    backgroundColor="rgba(0, 0, 0, 0.5)"
                />
                <Dialog.Content
                    bordered
                    elevate
                    key="content"
                    backgroundColor="background"
                    gap={8}
                    p={24}
                    w="90%"
                >
                    <DialogContent
                        title={title}
                        message={message}
                        confirmLabel={confirmLabel}
                        cancelLabel={cancelLabel}
                        destructive={destructive}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                    >{children}</DialogContent>
                </Dialog.Content>
            </Dialog.Portal>
            <Adapt when="max-md" platform="touch">
                <Sheet modal dismissOnSnapToBottom snapPointsMode="fit">
                    <Sheet.Overlay backgroundColor="rgba(0, 0, 0, 0.5)" />
                    <Sheet.Container pb={insets.bottom + Spacing.four} px={Spacing.four} pt={Spacing.four}>
                        <Sheet.Background backgroundColor="background" />
                        <Sheet.ScrollView>
                            <Adapt.Contents />
                        </Sheet.ScrollView>
                    </Sheet.Container>
                </Sheet>
            </Adapt>
        </Dialog>
    );
}

function DialogContent({
    title,
    message,
    confirmLabel,
    cancelLabel,
    destructive,
    onConfirm,
    onCancel,
    children,
}: Readonly<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: ReactNode;
}>) {
    return (
        <>
            <YStack gap={8}>
                <Dialog.Title asChild>
                    <Text fontSize={24} fontWeight="600">{title}</Text>
                </Dialog.Title>
                <Dialog.Description asChild>
                    <Text color="textSecondary">{message}</Text>
                </Dialog.Description>
            </YStack>

            {children}
            <XStack justify="flex-end" gap={8} mt={8}>
                <Dialog.Close asChild displayWhenAdapted aria-label={cancelLabel}>
                    <Button onPress={onCancel}>{cancelLabel}</Button>
                </Dialog.Close>
                {destructive ? (
                    <Dialog.Close asChild displayWhenAdapted aria-label={confirmLabel}>
                        <Button
                            backgroundColor="error"
                            color="errorText"
                            onPress={() => {
                                triggerPrimaryButtonHaptic();
                                onConfirm();
                            }}>
                            {confirmLabel}
                        </Button>
                    </Dialog.Close>
                ) : (
                    <Dialog.Close asChild displayWhenAdapted aria-label={confirmLabel}>
                        <Button onPress={onConfirm}>{confirmLabel}</Button>
                    </Dialog.Close>
                )}
            </XStack>
        </>
    );
}

export default ConfirmDialog;
