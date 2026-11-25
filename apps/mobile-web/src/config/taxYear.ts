import { useSyncExternalStore } from 'react'

/**
 * The running tax year comes from the server's clock (OPS-16): `GET /v1/capabilities` names it
 * (`runningTaxYear`), and `ParseTaxYearPipe` on the server stays the judge of which years a path may name.
 * Until that answer arrives the device clock in German time stands in, so a new year never waits for a
 * release (no year is written into the code).
 */

/** How many years the cockpit offers: the running one and the four before it (matches the server). */
const SELECTABLE_YEAR_COUNT = 5

function deviceYear(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(now))
}

let serverYear: number | null = null
const listeners = new Set<() => void>()

/** The running calendar year — still open, so it can only be prepared, not filed (K2). */
export function runningTaxYear(): number {
  return serverYear ?? deviceYear(new Date())
}

/** The years the cockpit offers: the running one and the four before it. */
export function selectableTaxYears(): readonly number[] {
  const running = runningTaxYear()
  return Array.from({ length: SELECTABLE_YEAR_COUNT }, (_, i) => running - i)
}

/**
 * The year a new user starts in: the last completed one, the one that can be filed now.
 * The running year stays selectable, but only on an explicit choice (UX review, K2).
 */
export function defaultTaxYear(): number {
  return runningTaxYear() - 1
}

/** Whether `year` is the running year (prepare mode: collect receipts, no official forms yet). */
export function isRunningTaxYear(year: number): boolean {
  return year === runningTaxYear()
}

/** Takes the server's answer; every screen that reads the clock through `useTaxYearClock` follows. */
export function setServerRunningTaxYear(year: number | null): void {
  const next = year !== null && Number.isInteger(year) ? year : null
  if (next === serverYear) return
  serverYear = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The running year, re-rendering when the server's answer changes it. */
export function useTaxYearClock(): number {
  return useSyncExternalStore(subscribe, runningTaxYear, runningTaxYear)
}
