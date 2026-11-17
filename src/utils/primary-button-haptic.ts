import * as Haptics from 'expo-haptics';

export function triggerPrimaryButtonHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
    console.warn('Primary button haptic feedback failed.', error);
  });
}
