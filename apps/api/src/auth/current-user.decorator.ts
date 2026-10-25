// Reads the userId the UserContextGuard already established. Any route using this
// decorator MUST also be behind UserContextGuard — that invariant is enforced at
// runtime below rather than silently returning an undefined/forgeable userId.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { USER_ID_KIND_REQUEST_KEY, USER_ID_REQUEST_KEY, type RequestWithUserId, type UserIdKind } from './user-context.guard.js'

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const userId = request[USER_ID_REQUEST_KEY]
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('@CurrentUser() used on a route without UserContextGuard.')
  }
  return userId
})

/**
 * ADR-0045 — the identity *kind* UserContextGuard recorded ('session' | 'guest'), for routes
 * that admit guests to part of their surface and must decide the rest per request. Same
 * invariant as @CurrentUser(): only valid behind UserContextGuard, never derived from the id.
 */
export const CurrentUserKind = createParamDecorator((_data: unknown, context: ExecutionContext): UserIdKind => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const kind = request[USER_ID_KIND_REQUEST_KEY]
  if (kind !== 'session' && kind !== 'guest') {
    throw new Error('@CurrentUserKind() used on a route without UserContextGuard.')
  }
  return kind
})
