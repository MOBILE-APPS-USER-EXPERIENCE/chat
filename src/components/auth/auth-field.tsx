import { Spacing } from '@/constants/layout';
import { Input, Label, YStack, type InputProps } from 'tamagui';

type Props = InputProps & { id: string; label: string };

export function AuthField({ id, label, ...props }: Props) {
    return (
        <YStack gap={Spacing.one}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                borderColor="backgroundSelected"
                color="text"
                h={48}
                px={Spacing.three}
                {...props}
            />
        </YStack>
    );
}
