import { useSyncExternalStore } from 'react'

export interface SavedEmployer {
  readonly id: string
  readonly name: string
  readonly strasse: string
  readonly plzOrt: string
  readonly land: 'CH' | 'DE'
  readonly uid?: string
}

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

function readFromMemory(): readonly SavedEmployer[] {
  if (cachedEmployers !== null) return cachedEmployers
  cachedEmployers = DEFAULT_EMPLOYERS
  return cachedEmployers
}

function writeToMemory(next: readonly SavedEmployer[]): void {
  cachedEmployers = next
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
  return readFromMemory()
}

export function addSavedEmployer(input: Omit<SavedEmployer, 'id'> & { readonly id?: string }): SavedEmployer {
  const current = readFromMemory()
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
  writeToMemory(next)
  return entry
}

export function removeSavedEmployer(id: string): void {
  const current = readFromMemory()
  writeToMemory(current.filter((item) => item.id !== id))
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
