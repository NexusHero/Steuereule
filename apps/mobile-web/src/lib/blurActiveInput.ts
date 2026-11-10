import { Keyboard, Platform } from 'react-native'

/** Blurs the focused web input or dismisses the native keyboard so field `onBlur` auto-saves fire before closing a sheet. */
export function blurActiveInput(): void {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return
    const active = document.activeElement as { blur?: () => void } | null
    active?.blur?.()
    return
  }
  Keyboard.dismiss()
}
