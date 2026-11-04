import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_CONTEXT_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

export const REQUIRED_SCOPES_KEY = 'requiredScopes'

/** §2: Enforces OAuth 2.1 scopes when a request originates from an assistant. */
@Injectable()
export class RequireScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredScopes || requiredScopes.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const authContext = request[AUTH_CONTEXT_REQUEST_KEY]

    if (!authContext || authContext.source !== 'assistent') {
      return true
    }

    const grantedScopes = new Set(authContext.scopes)
    for (const scope of requiredScopes) {
      if (!grantedScopes.has(scope)) {
        throw new ForbiddenException(`Fehlender OAuth-Scope: ${scope}`)
      }
    }

    return true
  }
}

export function RequireScope(...scopes: string[]): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(REQUIRED_SCOPES_KEY, scopes), UseGuards(RequireScopeGuard))
}
