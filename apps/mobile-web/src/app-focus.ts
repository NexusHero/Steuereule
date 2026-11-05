import { AppState, Platform } from 'react-native'
import { focusManager } from '@tanstack/react-query'

export interface AppStateSource {
  addEventListener(type: 'change', handler: (state: string) => void): { remove(): void }
}

/** Native apps have no window focus event; this lets TanStack Query refetch stale data when the app returns to the foreground. */
export function followAppStateFocus(appState: AppStateSource = AppState): () => void {
  const subscription = appState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'))
  return () => subscription.remove()
}

export function followNativeAppFocus(): void {
  if (Platform.OS !== 'web') followAppStateFocus()
}
