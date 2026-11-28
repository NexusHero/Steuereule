import { applyDecorators, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard, type ThrottlerGetTrackerFunction } from '@nestjs/throttler'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from '../auth/user-context.guard.js'

export const DEVICE_CODE_THROTTLE = { ttl: 60_000, limit: 10 } as const

export const DEVICE_PENDING_THROTTLE = { ttl: 60_000, limit: 10 } as const

/** Approving a device by its user code; unthrottled it answered ~250 guesses a second (ADR-0106 D11). */
export const DEVICE_APPROVE_THROTTLE = { ttl: 60_000, limit: 10 } as const

/**
 * Exchanging an approved device code (H2-16). A device polls every 5 s for at most the code's 2 minutes, so
 * 60 a minute per address leaves room for five desktops behind one address and stops anything faster.
 */
export const DEVICE_TOKEN_THROTTLE = { ttl: 60_000, limit: 60 } as const

/** The consent screen's client lookup (H2-17): public, so bounded per address. */
export const OAUTH_CLIENT_INFO_THROTTLE = { ttl: 60_000, limit: 30 } as const

/** The DSGVO export reads the whole account and may start Chromium (ADR-0109). */
export const ACCOUNT_EXPORT_THROTTLE = { ttl: 60 * 60_000, limit: 5 } as const

/** Starting a printout renders PDFs in Chromium (ADR-0109). */
export const PRINTOUT_JOB_THROTTLE = { ttl: 10 * 60_000, limit: 10 } as const
/** Checkout starts per account (API-4): an open session is reused, so a few are plenty. */
export const CHECKOUT_THROTTLE = { ttl: 10 * 60_000, limit: 10 } as const

export const VERIFY_PASSWORD_THROTTLE = { ttl: 10_000, limit: 3 } as const

export const LINK_JOIN_THROTTLE = { ttl: 60_000, limit: 5 } as const

/** One search per keystroke pause; generous for typing, tight enough that the street list cannot be scraped. */
export const ADDRESS_SEARCH_THROTTLE = { ttl: 60_000, limit: 120 } as const

export const accountKeyedTracker: ThrottlerGetTrackerFunction = (req) => {
  const userId = (req as RequestWithUserId)[USER_ID_REQUEST_KEY]
  return userId ?? (req as { ip?: string }).ip ?? 'no-ip'
}

/** The synchronous printout: every call renders the whole return as a PDF on the request (API-6). */
export const SYNC_PRINTOUT_THROTTLE = { ttl: 10 * 60_000, limit: 10 } as const

/** A bank statement import parses up to 900,000 characters of CSV or camt per call (H2-14). */
export const BANK_IMPORT_THROTTLE = { ttl: 10 * 60_000, limit: 20 } as const

/** The GoBD ZIP and the E-Bilanz XBRL are built from the whole book on every call (H2-14). */
export const BUSINESS_EXPORT_THROTTLE = { ttl: 10 * 60_000, limit: 30 } as const

/** Validating or sending the E-Bilanz starts the ERiC sidecar on every call (H2-14). */
export const ERIC_THROTTLE = { ttl: 10 * 60_000, limit: 10 } as const

/** „Jetzt zusammenfassen“ asks the model (H2-12); the day's message cap counts it as well. */
export const SUMMARIZE_THROTTLE = { ttl: 10 * 60_000, limit: 10 } as const

/**
 * The owl's voice asks a speech model once per passage (ADR-0115): an answer is some ten passages, so this is
 * a dozen answers read in ten minutes, far above listening and far below a free speech service.
 */
export const SPEECH_THROTTLE = { ttl: 10 * 60_000, limit: 150 } as const

/**
 * A per-account limit on the shared throttler storage (ADR-0109 §1). The class's UserContextGuard runs first, so
 * the account is known; a guest counts by address.
 */
export function AccountThrottle(policy: { readonly ttl: number; readonly limit: number }): MethodDecorator & ClassDecorator {
  return applyDecorators(Throttle({ default: { ...policy, getTracker: accountKeyedTracker } }), UseGuards(ThrottlerGuard))
}
