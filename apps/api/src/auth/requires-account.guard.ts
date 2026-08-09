// Route-scoped seam: rejects a guest (no real account session) with 401 (#318 — no
// guest path for the interview endpoints, without waiting on #317). Reads the
// identity kind UserContextGuard already attached to the request; never re-derives
// it, never calls better-auth again itself. This MUST run after UserContextGuard in
// the guard chain, which Nest's fixed guard order (global -> controller -> method)
// guarantees whenever @RequiresAccount() decorates a route on a controller already
// behind @UseGuards(UserContextGuard) — exactly how InterviewController uses it.
//
// Deliberately does not sniff newGuestUserId()'s string shape: it's a bare
// randomUUID() (guest-session.ts), indistinguishable from a real account id by
// construction — the only trustworthy signal is the *kind* UserContextGuard recorded
// while resolving the request, never anything derived from the id string itself.
//
// Additive: no existing route's behaviour changes. A route that never adds
// @RequiresAccount() keeps accepting guests exactly as before; this only narrows the
// routes that opt in. It is also #317's own eventual end state ("valid session, else
// 401") applied to one module first — #317 generalises this, it does not replace it.
import { Injectable, UnauthorizedException, UseGuards, applyDecorators, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { USER_ID_KIND_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

export class GuestCannotUseThisEndpointError extends UnauthorizedException {
  constructor() {
    super('This endpoint requires a signed-in account, not a guest session.')
  }
}

@Injectable()
export class RequiresAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    if (request[USER_ID_KIND_REQUEST_KEY] !== 'session') {
      throw new GuestCannotUseThisEndpointError()
    }
    return true
  }
}

/**
 * Apply to a controller method (or a whole controller) already behind
 * @UseGuards(UserContextGuard). Rejects a guest caller with 401; a real account
 * session passes through unchanged.
 */
export function RequiresAccount(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(RequiresAccountGuard))
}
