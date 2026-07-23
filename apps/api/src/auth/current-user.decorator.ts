// Reads the userId the UserContextGuard already established. Any route using this
// decorator MUST also be behind UserContextGuard — that invariant is enforced at
// runtime below rather than silently returning an undefined/forgeable userId.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUserId>()
  const userId = request[USER_ID_REQUEST_KEY]
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('@CurrentUser() used on a route without UserContextGuard.')
  }
  return userId
})
