// The resolution seam for "which country does this request look like it's from?"
// (#238 task 0b, ADR-0024). Country-level only (Art. 5(1)(c) data minimisation — the
// screen's job is "does this look like you?", which a country answers; city-level
// would be more personal data for no added verification value).
//
// A resolver never guesses. UNKNOWN_REGION is returned — never thrown, never a
// best-effort partial answer — whenever the address is private/unroutable, doesn't
// match anything in the configured database, or the database itself has gone stale
// (ADR-0021: a control that fails loudly, not a silent wrong answer). "unknown" is a
// value the match-verification screen renders as "Region unbekannt", not a sentinel
// this app tries to interpret further.
export const UNKNOWN_REGION = 'unknown'

export const REGION_RESOLVER = Symbol('REGION_RESOLVER')

export interface RegionResolver {
  /**
   * Resolves an IP address to a country code (e.g. "DE"), or UNKNOWN_REGION.
   * `ip` is whatever the caller had on hand — including null, when no address could
   * be determined at all. Never throws: an unresolvable/misshapen input is exactly
   * the "I don't know" case this function exists to represent honestly.
   */
  resolve(ip: string | null): Promise<string>
}
