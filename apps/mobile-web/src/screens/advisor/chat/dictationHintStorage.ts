/**
 * Dictation step 1 (#451 slice 4, decision 10): a hint to use the keyboard's or the operating
 * system's own dictation; no speech code of our own. Dismissing it once is a per-device UI
 * preference, written only on that explicit click — the same pattern as the haptics and
 * appearance preferences, never tax data (ADR-0008).
 */
export const DICTATION_HINT_STORAGE_KEY = 'steuereule.dictationHintDismissed'

export function readDictationHintDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(DICTATION_HINT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeDictationHintDismissed(): void {
  try {
    globalThis.localStorage?.setItem(DICTATION_HINT_STORAGE_KEY, 'true')
  } catch {
    // storage disabled (private mode / native env): the hint is simply hidden for this session
  }
}
