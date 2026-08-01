// Parses a raw User-Agent string into a short, human browser/OS label, and resolves a
// RegionResolver country code into a localized country name — the two "make raw request
// context readable" concerns AC-3 (#238's match-verification/Freigabe screen) and AC-5
// (the device list in Profil) both need. `DevicePendingResponseDto`'s own comment names
// exactly this split: "`userAgent`/`region` are deliberately raw — parsing them into a
// friendly label is a rendering concern for task 3's approval screen, not this endpoint's
// contract" (apps/api/src/device/dto/device-pending-response.dto.ts).
//
// One shared parsing/formatting module for two independent *screens* — not one shared
// *test*. AC-3 and AC-5 each require their own, separately provable region-branch
// assertion (Suhay's ticket note: two rendering paths, two tests, neither stands in for
// the other); this file is reused by both, exercised by both's own test file.
//
// No `ua-parser-js`/similar dependency: the browser/OS set worth naming here is small and
// stable (evergreen desktop/mobile browsers), and a dependency was already asked of
// NexusHero once this slice (`qrcode-generator`, a genuine hard requirement — you cannot
// encode a QR without one). A UA string that matches nothing degrades honestly to `null`,
// never a guess, never a throw — the caller renders its own honest "unknown device" copy.

export interface DeviceLabel {
  readonly browser: string | null
  readonly os: string | null
}

// Order matters: browsers that embed another's token in their own UA string (Edge and
// Opera both carry "Chrome/", iOS Chrome/Firefox both carry "Safari/"-shaped tokens) must
// be checked before the engine they're built on.
const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/CriOS\//, 'Chrome'],
  [/FxiOS\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Version\/.*Safari\//, 'Safari'],
]

// iOS Safari/Chrome/Firefox UAs all carry a "like Mac OS X" platform token (Apple's own
// compatibility convention) — `iPhone|iPad|iPod` must be checked before `Mac OS X`, or
// every iOS device misreads as macOS.
const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

/** Never throws, never guesses past what the string actually contains — an unrecognised
 *  or absent User-Agent yields `{ browser: null, os: null }`, not a fabricated default. */
export function parseUserAgent(userAgent: string | null): DeviceLabel {
  if (!userAgent) return { browser: null, os: null }
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  return { browser, os }
}

// Mirrors apps/api/src/device/region/region-resolver.ts's `UNKNOWN_REGION` value —
// restated, not imported: the frontend and the API are separate deployables (the same
// boundary every generated DTO already crosses via the OpenAPI contract, not a direct
// import), and this one literal is exactly what RegionResolver's own doc comment fixes as
// the never-changing sentinel for "could not resolve, and did not guess."
const UNKNOWN_REGION = 'unknown'

/**
 * Resolves a country code (e.g. "DE") to its localized display name, or `null` when the
 * region is unresolved (`UNKNOWN_REGION`, absent, or unrecognised) — the caller renders
 * its own honest "Region unbekannt" copy for `null` rather than this module returning
 * translated text itself (ADR-0006: user-facing copy lives in i18n resources).
 */
export function resolveRegionName(region: string | null, locale: string): string | null {
  if (!region || region === UNKNOWN_REGION) return null
  let displayNames: Intl.DisplayNames
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
  const name = displayNames.of(region.toUpperCase())
  // Intl.DisplayNames doesn't throw on a code it doesn't recognise — it hands the input
  // straight back (case-folded). Rendering that as though it were a real country name is
  // exactly the guess RegionResolver's own "never guesses" contract forbids on the
  // backend; comparing case-insensitively against the input folds an unrecognised code
  // into the same honest "unknown" path as the sentinel itself, instead of rendering
  // "DE" or "XX" back at the user as if it meant something.
  if (!name || name.toUpperCase() === region.toUpperCase()) return null
  return name
}

/**
 * Formats a request's `requestedAt` timestamp for display, in the app's current
 * language — this is a "does this look like you, right now" comparison aid, not a
 * financial figure (unlike `@steuereule/core/format.ts`'s deliberately German-fixed
 * currency formatting), so it follows the UI locale rather than staying pinned to
 * `de-DE`. Returns `null` for an absent/malformed timestamp — the caller renders its
 * own honest fallback copy rather than this module inventing one.
 */
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
