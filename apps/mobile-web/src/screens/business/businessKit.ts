import { formatEuroCents, toGermanDate } from '@steuereule/core'

export type Person = 'A' | 'B'

/** The `?person=` query of the self-employment endpoints: none for A (the default). */
/** The query of a business page: the spouse's business (`person=B`) and a further business (`betrieb`, ADR-0101 §22). */
export function personParams(person: Person, business = 1): { readonly person?: 'B'; readonly betrieb?: number } | undefined {
  if (person !== 'B' && business === 1) return undefined
  return { ...(person === 'B' ? { person: 'B' as const } : {}), ...(business !== 1 ? { betrieb: business } : {}) }
}

/** A plain signed amount (`+1.234,50 €`, `−80,00 €`): the book speaks in cents, the screen in signed euros. */
export function signedCents(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}${formatEuroCents(Math.abs(cents) / 100)}`
}

export function plainCents(cents: number): string {
  return formatEuroCents(cents / 100)
}

/** A plain amount in euros: no sign, for what is not a result or a change (the app's convention). */
export function plainEuro(euro: number): string {
  return formatEuroCents(euro)
}

/** A German date (`20.09.2025`) from an ISO one; what is not a date stays as it is. */
export function germanDay(iso: string): string {
  return toGermanDate(iso) ?? iso
}

/** Signed euros (the tax results are computed in euros). */
export function signedEuro(euro: number): string {
  return signedCents(Math.round(euro * 100))
}

/** Parses a German or plain decimal euro entry (`1.234,50`, `12,5`, `80`) into cents; null when it is no amount. */
export function eurosToCents(raw: string): number | null {
  const text = raw.trim().replaceAll(' ', '')
  if (text === '') return null
  const normalised = text.includes(',') ? text.replaceAll('.', '').replace(',', '.') : text
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}

export interface ApiProblem {
  readonly status: number
  readonly code: string | null
  readonly message: string | null
}

/** What a non-2xx answer says: the API's code and its German reason (shown plainly, never swallowed). */
export function problemOf(response: { readonly status: number; readonly data?: unknown }): ApiProblem {
  const body = response.data
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const message = typeof record.message === 'string' ? record.message : Array.isArray(record.message) ? record.message.join(' ') : null
  return { status: response.status, code: typeof record.code === 'string' ? record.code : null, message }
}

export function isOk(status: number): boolean {
  return status >= 200 && status < 300
}

/** A number somewhere inside an untyped answer (`a.b.c`); null when it is not there. */
export function numberAt(source: unknown, path: string): number | null {
  let current: unknown = source
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null
}

export function recordAt(source: unknown, key: string): Record<string, unknown> | null {
  if (source === null || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function stringAt(source: unknown, key: string): string | null {
  if (source === null || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
