import { Spacing } from '@/config/layout';
import { Input, Label, YStack, type InputProps } from 'tamagui';
import { forwardRef } from 'react';
import type { TamaguiElement } from '@tamagui/web';

type Props = InputProps & { id: string; label: string };

export const AuthField = forwardRef<TamaguiElement, Props>(function AuthField(
    { id, label, ...props },
    ref,
) {
    return (
        <YStack gap={Spacing.one}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                ref={ref}
                id={id}
                borderColor="backgroundSelected"
                color="text"
                placeholderTextColor='textSecondary'
                h={48}
                px={Spacing.three}
                {...props}
            />
        </YStack>
    );
});
