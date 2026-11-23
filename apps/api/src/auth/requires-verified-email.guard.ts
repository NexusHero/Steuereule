import { ForbiddenException, Injectable, UseGuards, applyDecorators, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { EMAIL_VERIFIED_REQUEST_KEY, USER_ID_KIND_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

export class EmailNotVerifiedError extends ForbiddenException {
  constructor() {
    super('Für diese Aktion muss deine E-Mail-Adresse bestätigt sein.')
  }
}

/**
 * Gates a sensitive action on a verified email (ADR-0103, vulnerability 4).
 *
 * Sign-up stays open to unverified accounts — guest-first onboarding depends on it (ADR-0012 `autoSignIn`,
 * ADR-0030 sweeps the ones that are never verified), so `requireEmailVerification` is deliberately left
 * off. The cost is paid at the sensitive action instead: a signed-in account whose email is not yet
 * verified is refused here.
 *
 * Stack it after `@RequiresAccount()`. A guest never reaches this guard (RequiresAccount already refuses
 * one); a bearer/assistant caller is allowed through — it acts for an account that completed the OAuth
 * consent and cannot verify an email itself (ADR-0052). Only a session whose `emailVerified` is not `true`
 * is blocked.
 */
@Injectable()
export class RequiresVerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    if (request[USER_ID_KIND_REQUEST_KEY] !== 'session') return true
    if (request[EMAIL_VERIFIED_REQUEST_KEY] === true) return true
    throw new EmailNotVerifiedError()
  }
}

export function RequiresVerifiedEmail(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(RequiresVerifiedEmailGuard))
}
