import { forwardRef, useId, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { initials } from './format';

export const palette = {
  ink: '#172F2B', muted: '#50665D', green: '#24765C', dark: '#123E32',
  canvas: '#F3F5F1', line: '#E3EAE3', white: '#FFFFFF', mint: '#E0EFE4',
  soft: '#F6F8F4', error: '#A43232', errorBg: '#FFF1EE', inputBorder: '#7C9186',
};

export function Avatar({ name, size = 44, dark = false }: { name: string; size?: number; dark?: boolean }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
    style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.34 }, dark && styles.avatarDark]}>
    <Text style={[styles.avatarText, { fontSize: size * 0.32 }, dark && { color: '#D8EEE0' }]}>{initials(name)}</Text>
  </View>;
}

export function Button({ children, onPress, busy, disabled, secondary, label, busyLabel = 'Bitte warten …' }: PropsWithChildren<{
  onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; label?: string; busyLabel?: string;
}>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || busy) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
    {busy ? <View style={styles.busyRow}><ActivityIndicator color={secondary ? palette.green : '#fff'} />
      <Text style={[styles.buttonText, secondary && { color: palette.green }]}>{busyLabel}</Text></View> :
      <Text style={[styles.buttonText, secondary && { color: palette.green }]}>{children}</Text>}
  </Pressable>;
}

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string; required?: boolean; trailing?: ReactNode };
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, required, trailing, ...props }, ref) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const description = [hint, error].filter(Boolean).join(' ');
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.inputFrame, error && { borderColor: palette.error }, focused && styles.focused]}>
      <TextInput {...props} ref={ref} accessibilityLabel={label} accessibilityHint={description}
        {...(Platform.OS === 'web' ? { 'aria-describedby': description ? `${id}-description` : undefined, 'aria-invalid': !!error, 'aria-required': required } : {})}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        placeholderTextColor={palette.muted} style={[styles.input, props.style]} />
      {trailing}
    </View>
    {!!description && <View nativeID={`${id}-description`} style={{ gap: 4 }}>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {!!error && <Text style={styles.errorText}>Fehler: {error}</Text>}
    </View>}
  </View>;
});

export function ErrorBanner({ text, onRetry }: { text: string; onRetry?: () => void }) {
  if (!text) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
    <Text style={styles.errorText}>{text}</Text>
    {onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
      <Text style={{ color: palette.error, fontWeight: '700', fontSize: 14 }}>Erneut versuchen</Text>
    </Pressable>}
  </View>;
}

export const styles = StyleSheet.create({
  avatar: { backgroundColor: palette.mint, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarDark: { backgroundColor: '#2B5849' },
  avatarText: { color: palette.green, fontWeight: '700' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: palette.mint },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { gap: 7 },
  fieldLabel: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  inputFrame: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: palette.inputBorder, borderRadius: 10, backgroundColor: palette.soft },
  focused: { borderColor: palette.green },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 16, color: palette.ink, borderRadius: 10 },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  error: { padding: 12, borderRadius: 10, backgroundColor: palette.errorBg, gap: 5 },
  errorText: { color: palette.error, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  retry: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, borderWidth: 1, borderColor: palette.error, borderRadius: 8 },
});
