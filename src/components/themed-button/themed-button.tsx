import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@expo/ui';
import { getThemedButtonColors, ThemedButtonProps } from './themed-button-props';

export function ThemedButton({ title, onPress, style }: Readonly<ThemedButtonProps>) {
    const theme = useTheme();
    const { backgroundColor, textColor } = getThemedButtonColors(style, theme);

    return (
        <Button
            onPress={onPress}
            style={{ backgroundColor }}
        >
            <ThemedText style={{ color: textColor }}>{title}</ThemedText>
        </Button>
    );
}
