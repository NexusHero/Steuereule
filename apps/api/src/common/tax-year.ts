/** The oldest tax year the API accepts in a path. */
export const MIN_TAX_YEAR = 2000

/** How many years the app offers: the running one and the ones before it. */
export const SELECTABLE_TAX_YEAR_COUNT = 5

/**
 * The running tax year by the server's clock, in German time (OPS-16): from 1 January 00:00 in Berlin the
 * new year runs, whatever the host's time zone. The client takes this from `GET /v1/capabilities`.
 */
export function runningTaxYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(now)
  return Number(year)
}

/** The newest year a path may name: the running one plus one, for receipts of the coming year. */
export function maxTaxYear(now: Date = new Date()): number {
  return runningTaxYear(now) + 1
}
