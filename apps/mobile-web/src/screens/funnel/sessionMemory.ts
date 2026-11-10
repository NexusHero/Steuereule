import type { FunnelPath } from './KontoWandScreen'

/**
 * What the user chose in this browser session must survive leaving the app screen — registration and
 * onboarding are separate routes (finding F12 of the 2025 test run: the year fell back to 2026 and the
 * Grenzgänger path did not continue). Session storage only: per-viewer convenience, never tax data.
 * Every access is guarded — private windows and blocked storage simply fall back to the defaults.
 */
const TAX_YEAR_KEY = 'steuereule.taxYear'
const PENDING_PATH_KEY = 'steuereule.pendingPath'
const RETURN_TO_KEY = 'steuereule.returnTo'
const PATHS: readonly FunnelPath[] = ['angestellte', 'ch', 'rente']

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    const s = storage()
    if (!s) return
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    // storage blocked or full — the in-memory state still works for this page
  }
}

export function rememberedTaxYear(fallback: number, years: readonly number[]): number {
  const stored = Number(read(TAX_YEAR_KEY))
  return years.includes(stored) ? stored : fallback
}

export function rememberTaxYear(year: number): void {
  write(TAX_YEAR_KEY, String(year))
}

export function rememberedPendingPath(): FunnelPath | null {
  const stored = read(PENDING_PATH_KEY)
  return PATHS.find((p) => p === stored) ?? null
}

export function rememberPendingPath(path: FunnelPath | null): void {
  write(PENDING_PATH_KEY, path)
}

export function rememberedReturnTo(): string | null {
  const stored = read(RETURN_TO_KEY)
  return stored !== null && stored.startsWith('/app/') ? stored : null
}

export function rememberReturnTo(path: string | null): void {
  if (path === null) {
    write(RETURN_TO_KEY, null)
    return
  }
  if (path.startsWith('/app/')) {
    write(RETURN_TO_KEY, path)
  }
}
