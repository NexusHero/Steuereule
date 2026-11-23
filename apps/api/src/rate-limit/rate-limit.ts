import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from '../auth/user-context.guard.js'

export const DEVICE_CODE_THROTTLE = { ttl: 60_000, limit: 10 } as const

export const DEVICE_PENDING_THROTTLE = { ttl: 60_000, limit: 10 } as const

/** Approving a device by its user code; unthrottled it answered ~250 guesses a second (ADR-0106 D11). */
export const DEVICE_APPROVE_THROTTLE = { ttl: 60_000, limit: 10 } as const

/** Receipt uploads per account (ADR-0106 D7): a busy scanning session stays well below it. */
export const RECEIPT_UPLOAD_THROTTLE = { ttl: 10 * 60_000, limit: 60 } as const

export const VERIFY_PASSWORD_THROTTLE = { ttl: 10_000, limit: 3 } as const

export const LINK_JOIN_THROTTLE = { ttl: 60_000, limit: 5 } as const

/** One search per keystroke pause; generous for typing, tight enough that the street list cannot be scraped. */
export const ADDRESS_SEARCH_THROTTLE = { ttl: 60_000, limit: 120 } as const

export const accountKeyedTracker: ThrottlerGetTrackerFunction = (req) => {
  const userId = (req as RequestWithUserId)[USER_ID_REQUEST_KEY]
  return userId ?? (req as { ip?: string }).ip ?? 'no-ip'
}
