import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import {
  AUTH_CONTEXT_REQUEST_KEY,
  USER_ID_KIND_REQUEST_KEY,
  USER_ID_REQUEST_KEY,
  type AuthContext,
  type RequestWithUserId,
  type UserIdKind,
} from './user-context.guard.js'

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const userId = request[USER_ID_REQUEST_KEY]
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('@CurrentUser() used on a route without UserContextGuard.')
  }
  return userId
})

export const CurrentUserKind = createParamDecorator((_data: unknown, context: ExecutionContext): UserIdKind => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const kind = request[USER_ID_KIND_REQUEST_KEY]
  if (kind !== 'session' && kind !== 'guest' && kind !== 'bearer') {
    throw new Error('@CurrentUserKind() used on a route without UserContextGuard.')
  }
  return kind
})

export const CurrentAuthContext = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const authContext = request[AUTH_CONTEXT_REQUEST_KEY]
  if (!authContext) {
    throw new Error('@CurrentAuthContext() used on a route without UserContextGuard.')
  }
  return authContext
})
