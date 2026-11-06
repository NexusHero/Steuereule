import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from '../auth/user-context.guard.js'

export const DEVICE_CODE_THROTTLE = { ttl: 60_000, limit: 10 } as const

export const DEVICE_PENDING_THROTTLE = { ttl: 60_000, limit: 10 } as const

export const VERIFY_PASSWORD_THROTTLE = { ttl: 10_000, limit: 3 } as const

export const LINK_JOIN_THROTTLE = { ttl: 60_000, limit: 5 } as const

export const accountKeyedTracker: ThrottlerGetTrackerFunction = (req) => {
  const userId = (req as RequestWithUserId)[USER_ID_REQUEST_KEY]
  return userId ?? (req as { ip?: string }).ip ?? 'no-ip'
}
