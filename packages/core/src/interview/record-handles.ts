import type { Screen } from './marking'

/**
 * Masks that hold several records (rental objects, children) are addressed by the owl through a
 * neutral name — „Objekt 1“, „Kind 2“ — never through a name, an address or a database id. The
 * server knows which record a name stands for; the model only ever sees the name (ADR-0066).
 */
export interface AdvisorRecordHandle {
  readonly handle: string
  readonly id: string
}

export type AdvisorRecordHandles = Readonly<Partial<Record<Screen, readonly AdvisorRecordHandle[]>>>

const NOUN: Readonly<Partial<Record<Screen, { readonly one: string; readonly none: string }>>> = {
  vermietung: { one: 'Objekt', none: 'Es ist noch kein Vermietungsobjekt angelegt. Das Objekt legst du in der Maske Vermietung an, danach kann ich die Beträge vorbereiten.' },
  kind: { one: 'Kind', none: 'Es ist noch kein Kind angelegt. Das Kind legst du in der Maske Kinder an, danach kann ich die Angaben vorbereiten.' },
}

/** Names the records of one mask in their stored order: „Objekt 1“, „Objekt 2“, … */
export function buildRecordHandles(screen: Screen, ids: readonly string[]): readonly AdvisorRecordHandle[] {
  const noun = NOUN[screen]?.one ?? 'Eintrag'
  return ids.map((id, index) => ({ handle: `${noun} ${index + 1}`, id }))
}

export type RecordHandleResolution =
  | { readonly ok: true; readonly id: string; readonly handle: string }
  | { readonly ok: false; readonly code: 'NO_RECORD' | 'RECORD_REQUIRED' | 'UNKNOWN_RECORD'; readonly reason: string }

const positionOf = (raw: string): number | null => {
  const match = /(\d{1,3})\s*$/.exec(raw.trim())
  return match ? Number(match[1]) : null
}

/**
 * A record the owl prepares that does not exist yet (ADR-0091): „neu“, „neu 2“, „neues Kind 2“.
 * It is created when the user applies the draft; until then its id is this placeholder.
 */
export const NEW_RECORD_PREFIX = 'neu:'

export function isNewRecordId(id: string | null | undefined): boolean {
  return id?.startsWith(NEW_RECORD_PREFIX) === true
}

const NEW_RECORD = /^neu(?:e[sr]?)?(?:\s+[\p{L}]+)?(?:\s*(\d{1,2}))?$/iu

export interface ResolveRecordOptions {
  /** The owl may prepare a new record on this mask (a rental object; a child with the consent to personal data). */
  readonly allowNew?: boolean
}

/**
 * Finds the record a draft is meant for. One record needs no name; several need one; none means
 * the user creates it in the mask first — unless the owl may prepare a new one (ADR-0091).
 */
export function resolveRecordHandle(
  screen: Screen,
  records: readonly AdvisorRecordHandle[],
  raw: string | null | undefined,
  options: ResolveRecordOptions = {},
): RecordHandleResolution {
  const noun = NOUN[screen]
  const wanted = raw?.trim() ?? ''
  const fresh = options.allowNew ? NEW_RECORD.exec(wanted) : null
  if (fresh) {
    const number = fresh[1] ?? '1'
    return { ok: true, id: `${NEW_RECORD_PREFIX}${Number(number)}`, handle: `neues ${noun?.one ?? 'Eintrag'} ${Number(number)}` }
  }
  if (records.length === 0) {
    const none = noun?.none ?? 'Dafür ist noch kein Eintrag angelegt.'
    return { ok: false, code: 'NO_RECORD', reason: options.allowNew ? `${none} Einen neuen Eintrag bereitest du mit \`instance: „neu“\` vor.` : none }
  }
  const names = records.map((record) => record.handle).join(', ')
  if (wanted === '') {
    if (records.length === 1) return { ok: true, ...records[0]! }
    return { ok: false, code: 'RECORD_REQUIRED', reason: `Es gibt mehrere Einträge (${names}). Für welchen gilt die Angabe?` }
  }
  const exact = records.find((record) => record.handle.toLowerCase() === wanted.toLowerCase() || record.id === wanted)
  if (exact) return { ok: true, ...exact }
  const position = positionOf(wanted)
  const byPosition = position !== null ? records[position - 1] : undefined
  if (byPosition) return { ok: true, ...byPosition }
  return { ok: false, code: 'UNKNOWN_RECORD', reason: `„${wanted}“ gibt es nicht. Vorhanden: ${names}.` }
}

/** What the model is told about the records of the case: names only. */
export function describeRecordHandles(handles: AdvisorRecordHandles | undefined): string {
  const line = (screen: Screen, title: string): string => {
    const records = handles?.[screen] ?? []
    return `${title}: ${records.length === 0 ? 'keine angelegt' : records.map((record) => record.handle).join(', ')}`
  }
  return [line('vermietung', 'Vermietungsobjekte (Maske vermietung)'), line('kind', 'Kinder (Maske kind)')].join('\n')
}
