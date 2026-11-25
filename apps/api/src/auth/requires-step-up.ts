import { ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException, UseGuards, applyDecorators, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth.tokens.js'
import { FreshAuthRequiredError } from './fresh-auth.js'
import { STEP_UP_GRANT_REPOSITORY, type StepUpGrantRepository } from './step-up-grant.repository.js'
import { assertStepUp, StepUpRefusedError, type SensitiveAction } from './step-up-policy.js'
import { USER_ID_KIND_REQUEST_KEY, USER_ID_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

/** Metadata key the step-up lock reads (`step-up-route-classification.test.ts`). */
export const STEP_UP_ACTION_METADATA = 'steuereule:stepUpAction'

/**
 * The step-up rule on a `/v1` route (`step-up-policy.ts`): the caller's better-auth session must be younger
 * than the step-up window or carry a step-up grant recorded for it. A guest or a session-less caller is refused
 * with 401, an assistant token with 403 (an assistant never creates sessions, credentials or links), and a stale
 * session with `400 FRESH_AUTH_REQUIRED`, the code the web client answers with the re-authentication dialog.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(STEP_UP_GRANT_REPOSITORY) private readonly grants: StepUpGrantRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUserId & FastifyRequest>()
    if (request[USER_ID_KIND_REQUEST_KEY] === 'bearer') throw new ForbiddenException('Ein Assistent kann das nicht tun.')
    const found = await this.betterAuth.auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    const established = request[USER_ID_REQUEST_KEY]
    try {
      await assertStepUp({
        session: found ? { id: found.session.id, userId: found.user.id, createdAt: found.session.createdAt } : null,
        ...(established === undefined ? {} : { expectedUserId: established }),
        hasGrant: (sessionId) => this.grants.hasValidGrant(sessionId),
      })
    } catch (error) {
      if (!(error instanceof StepUpRefusedError)) throw error
      if (error.reason === 'stale') throw new FreshAuthRequiredError()
      throw new UnauthorizedException('Dafür musst du angemeldet sein.')
    }
    return true
  }
}

export function RequiresStepUp(action: SensitiveAction): MethodDecorator {
  return applyDecorators(SetMetadata(STEP_UP_ACTION_METADATA, action), UseGuards(StepUpGuard))
}
