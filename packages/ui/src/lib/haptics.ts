import { AccessibilityInfo, Platform } from 'react-native'

type ExpoHapticsModule = typeof import('expo-haptics')

let hapticsEnabled = true

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabled
}

async function runNativeHaptic(trigger: (haptics: ExpoHapticsModule) => Promise<void>): Promise<void> {
  if (Platform.OS === 'web' || !hapticsEnabled) return
  try {
    if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
      const reducedMotion = await AccessibilityInfo.isReduceMotionEnabled()
      if (reducedMotion) return
    }
    if (!hapticsEnabled) return
    const haptics = await import('expo-haptics')
    await trigger(haptics)
  } catch {
    // Haptic failures must never throw into callers or interrupt user interactions.
  }
}

export function hapticSelection(): Promise<void> {
  return runNativeHaptic((haptics) => haptics.selectionAsync())
}

export function hapticLight(): Promise<void> {
  return runNativeHaptic((haptics) => haptics.impactAsync(haptics.ImpactFeedbackStyle.Light))
}

export function hapticMedium(): Promise<void> {
  return runNativeHaptic((haptics) => haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium))
}

export function hapticSuccess(): Promise<void> {
  return runNativeHaptic((haptics) => haptics.notificationAsync(haptics.NotificationFeedbackType.Success))
}

export function hapticWarning(): Promise<void> {
  return runNativeHaptic((haptics) => haptics.notificationAsync(haptics.NotificationFeedbackType.Warning))
}
