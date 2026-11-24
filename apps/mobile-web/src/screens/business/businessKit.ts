import { formatEuroCents, toGermanDate } from '@steuereule/core'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { apiFailureMessage, classifyApiFailure, type ApiFailureKind } from '../../net/apiFailure'
import { parseGermanCents } from '../shared/germanNumber'

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

/** Parses a German euro entry (`1.234,50`, `40.000`, `12,5`, `80`) into cents with the shared parser (WEB-46); null when it is no amount. */
export function eurosToCents(raw: string): number | null {
  return parseGermanCents(raw)
}

/**
 * What went wrong with a request of the self-employed area, or with an entry the page checked itself. The
 * page never shows the raw server text (WEB-44): `problemText` reads it through the shared `net/apiFailure`
 * wording, and keeps only the business API's own German reasons (`BusinessErrorDto.message`, sent with a
 * stable `code` for a refused booking, a fixed frame, a broken chain).
 */
export interface ApiProblem {
  /** The rejection of the request (an `ApiError`, a `NetworkError`); null for an entry the page refused itself. */
  readonly error: unknown
  readonly status: number | undefined
  readonly code: string | null
  /** The German reason of an entry the page refused itself. */
  readonly local: string | null
}

export function problemOf(error: unknown): ApiProblem {
  const failure = classifyApiFailure(error)
  return { error, status: failure.status, code: failure.code ?? null, local: null }
}

/** A refusal the page found itself (an amount that is no amount), in German. */
export function localProblem(message: string): ApiProblem {
  return { error: null, status: undefined, code: null, local: message }
}

/** Failure kinds whose German reason the business API states itself (a domain refusal with its code). */
const DOMAIN_REASON_KINDS: ReadonlySet<ApiFailureKind> = new Set(['validation', 'conflict', 'not-found', 'unknown'])

/** The business API's own German reason of a domain refusal; undefined for a server error, a lost session, a DTO 400. */
export function domainReasonOf(error: unknown): string | undefined {
  if (!isApiError(error) || error.code === undefined) return undefined
  if (!DOMAIN_REASON_KINDS.has(classifyApiFailure(error).kind)) return undefined
  const body = error.body
  const message = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).message : undefined
  return typeof message === 'string' && message.trim() !== '' ? message : undefined
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/** The German sentence for a problem: the page's own reason, the API's domain reason, or the shared wording. */
export function problemText(problem: ApiProblem, t: Translate): string {
  if (problem.local !== null) return problem.local
  const reason = domainReasonOf(problem.error)
  if (reason !== undefined) return reason
  return apiFailureMessage(problem.error, t)
}

/** `problemText` bound to the app's language. */
export function useProblemText(): (problem: ApiProblem) => string {
  const { t } = useTranslation(APP_NS)
  return (problem) => problemText(problem, t as Translate)
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
