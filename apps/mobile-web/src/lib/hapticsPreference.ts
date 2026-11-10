import { setHapticsEnabled } from '@steuereule/ui'

export const HAPTICS_STORAGE_KEY = 'steuereule.haptics'

export function readHapticsPreference(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(HAPTICS_STORAGE_KEY)
    if (raw === 'false') return false
    if (raw === 'true') return true
    return true
  } catch {
    return true
  }
}

export function writeHapticsPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(HAPTICS_STORAGE_KEY, String(enabled))
  } catch {
    // storage disabled (private mode / CSP / native env)
  }
}

export function syncHapticsPreferenceFromStorage(): boolean {
  const enabled = readHapticsPreference()
  setHapticsEnabled(enabled)
  return enabled
}
