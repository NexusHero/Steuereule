export interface DeviceLabel {
  readonly browser: string | null
  readonly os: string | null
}

const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/CriOS\//, 'Chrome'],
  [/FxiOS\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Version\/.*Safari\//, 'Safari'],
]

const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

export function parseUserAgent(userAgent: string | null): DeviceLabel {
  if (!userAgent) return { browser: null, os: null }
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  return { browser, os }
}

const UNKNOWN_REGION = 'unknown'

export function resolveRegionName(region: string | null, locale: string): string | null {
  if (!region || region === UNKNOWN_REGION) return null
  let displayNames: Intl.DisplayNames
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
  const name = displayNames.of(region.toUpperCase())
  if (!name || name.toUpperCase() === region.toUpperCase()) return null
  return name
}

export function formatRequestedAt(requestedAt: string | null, locale: string): string | null {
  if (!requestedAt) return null
  const date = new Date(requestedAt)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return null
  }
}
