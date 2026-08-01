// The persistence seam for DeviceCode's *our-owned* columns (#238, ADR-0024) —
// DeviceService depends on this interface, not on Prisma directly, mirroring
// ProfileRepository (see that file's header comment for why: unit tests can swap in
// a fake that still honours the real per-deviceCode lookup, ADR-0004). The plugin's
// own nine columns are never written here — better-auth's Prisma adapter (via
// `auth.api.deviceCode(...)`) owns those exclusively; this repository only ever
// touches the five `request*`/`grantScope` columns we added.
export interface DeviceCodeRequestContext {
  /** The desktop's User-Agent at request time — null if the header was absent. */
  userAgent: string | null
  /** The desktop's request IP — null if it could not be determined. */
  ip: string | null
  /**
   * Country-level geo-IP result (task 0b's `RegionResolver`) — "unknown" (never a
   * guess) when unresolvable/stale, or null before resolution has run at all.
   */
  region: string | null
  requestedAt: Date
}

export const DEVICE_CODE_REPOSITORY = Symbol('DEVICE_CODE_REPOSITORY')

export interface DeviceCodeRepository {
  /**
   * Writes the desktop's request context onto the row `auth.api.deviceCode(...)` just
   * created, looked up by its RFC 8628 `device_code` (unique). Never creates a row —
   * the plugin's own adapter call is exclusively what does that; a missing row here
   * is a genuine bug (the write happens immediately after the create, same request),
   * not a valid "not found" outcome, so implementations let a missing-row error
   * propagate rather than swallowing it.
   */
  recordRequestContext(deviceCode: string, context: DeviceCodeRequestContext): Promise<void>
}
