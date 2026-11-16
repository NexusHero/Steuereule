import { useSyncExternalStore } from 'react'

export const EXPERT_MODE_STORAGE_KEY = 'steuereule.expertMode'

const listeners = new Set<() => void>()

/** Expert mode lets the user edit values directly in the official form view; off unless switched on. */
export function readExpertMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(EXPERT_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeExpertMode(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(EXPERT_MODE_STORAGE_KEY, String(enabled))
  } catch {
    // storage disabled (private mode / CSP / native env): the switch then holds for this run only
    fallback = enabled
  }
  for (const listener of listeners) listener()
}

let fallback: boolean | null = null

function snapshot(): boolean {
  return fallback ?? readExpertMode()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive across screens: switching it in the profile updates an open form view. */
export function useExpertMode(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
