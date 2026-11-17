import { useTheme } from "@/hooks/use-theme";

export type ThemedButtonProps = {
    title: string;
    onPress: () => void;
    style?: 'destructive' | 'accent' | 'default';
};

export function getThemedButtonColors(style: ThemedButtonProps['style'], theme: ReturnType<typeof useTheme>) {

    let backgroundColor: typeof theme.text | typeof theme.error | typeof theme.accent = theme.text;
    if (style === 'destructive') {
        backgroundColor = theme.error;
    } else if (style === 'accent') {
        backgroundColor = theme.accent;
    }

    let textColor: typeof theme.background | typeof theme.errorText | typeof theme.accentContrast = theme.background;
    if (style === 'destructive') {
        textColor = theme.errorText;
    } else if (style === 'accent') {
        textColor = theme.accentContrast;
    }

    return { backgroundColor, textColor };
}
