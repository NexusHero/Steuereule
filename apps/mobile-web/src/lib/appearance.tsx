import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { type ColorSchemeName } from 'react-native'
import { type ThemeMode } from '@steuereule/tokens'

export type AppearancePreference = 'system' | 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'steuereule.appearance'

export function readAppearancePreference(): AppearancePreference {
  try {
    const raw = globalThis.localStorage?.getItem(APPEARANCE_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
    return 'system'
  } catch {
    return 'system'
  }
}

export function writeAppearancePreference(preference: AppearancePreference): void {
  try {
    globalThis.localStorage?.setItem(APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // storage disabled (private mode / CSP / native env)
  }
}

export function resolveThemeMode(preference: AppearancePreference, colorScheme: ColorSchemeName): ThemeMode {
  if (preference === 'light' || preference === 'dark') return preference
  return colorScheme === 'dark' ? 'dark' : 'light'
}

interface AppearanceContextValue {
  readonly preference: AppearancePreference
  readonly setPreference: (next: AppearancePreference) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function AppearanceProvider({ children }: { readonly children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(() => readAppearancePreference())

  const setPreference = useCallback((next: AppearancePreference) => {
    writeAppearancePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference])
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  const [localPreference, setLocalPreference] = useState<AppearancePreference>(() => readAppearancePreference())
  const setLocal = useCallback((next: AppearancePreference) => {
    writeAppearancePreference(next)
    setLocalPreference(next)
  }, [])
  return ctx ?? { preference: localPreference, setPreference: setLocal }
}
