import { useSyncExternalStore } from 'react'

export interface SavedEmployer {
  readonly id: string
  readonly name: string
  readonly strasse: string
  readonly plzOrt: string
  readonly land: 'CH' | 'DE'
  readonly uid?: string
}

const STORAGE_KEY = 'steuereule.employers'

export const DEFAULT_EMPLOYERS: readonly SavedEmployer[] = [
  {
    id: 'emp-novartis-ch',
    name: 'Novartis Pharma AG',
    strasse: 'Lichtstrasse 35',
    plzOrt: '4056 Basel',
    land: 'CH',
    uid: 'CHE-116.268.029',
  },
  {
    id: 'emp-roche-ch',
    name: 'F. Hoffmann-La Roche AG',
    strasse: 'Grenzacherstrasse 124',
    plzOrt: '4070 Basel',
    land: 'CH',
    uid: 'CHE-105.815.301',
  },
]

let cachedEmployers: readonly SavedEmployer[] | null = null
const listeners = new Set<() => void>()

function readFromStorage(): readonly SavedEmployer[] {
  if (cachedEmployers !== null) return cachedEmployers
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          cachedEmployers = parsed as SavedEmployer[]
          return cachedEmployers
        }
      }
    }
  } catch {
    // Fallback to in-memory defaults
  }
  cachedEmployers = DEFAULT_EMPLOYERS
  return cachedEmployers
}

function writeToStorage(next: readonly SavedEmployer[]): void {
  cachedEmployers = next
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeEmployers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getEmployersSnapshot(): readonly SavedEmployer[] {
  return readFromStorage()
}

export function addSavedEmployer(input: Omit<SavedEmployer, 'id'> & { readonly id?: string }): SavedEmployer {
  const current = readFromStorage()
  const trimmedName = input.name.trim()
  const existingIndex = current.findIndex((e) => e.name.toLowerCase() === trimmedName.toLowerCase())
  const entry: SavedEmployer = {
    id: input.id ?? (existingIndex >= 0 ? current[existingIndex]!.id : `emp-${Date.now()}`),
    name: trimmedName,
    strasse: input.strasse.trim(),
    plzOrt: input.plzOrt.trim(),
    land: input.land,
    ...(input.uid && input.uid.trim() !== '' ? { uid: input.uid.trim() } : {}),
  }
  const next =
    existingIndex >= 0
      ? current.map((item, idx) => (idx === existingIndex ? entry : item))
      : [...current, entry]
  writeToStorage(next)
  return entry
}

export function removeSavedEmployer(id: string): void {
  const current = readFromStorage()
  writeToStorage(current.filter((item) => item.id !== id))
}

export function resetEmployersForTest(): void {
  cachedEmployers = null
}

export function useSavedEmployers() {
  const employers = useSyncExternalStore(subscribeEmployers, getEmployersSnapshot, getEmployersSnapshot)
  return {
    employers,
    addEmployer: addSavedEmployer,
    removeEmployer: removeSavedEmployer,
  }
}
