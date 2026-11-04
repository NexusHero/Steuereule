import {
  ForbiddenException,
  Injectable,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { AUTH_CONTEXT_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

export class AssistantForbiddenError extends ForbiddenException {
  constructor() {
    super('Assistenten dürfen diesen Endpunkt nicht aufrufen.')
  }
}

/** Server-side prohibition. */
@Injectable()
export class ForbidAssistantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const authContext = request[AUTH_CONTEXT_REQUEST_KEY]
    if (authContext?.source === 'assistent') {
      throw new AssistantForbiddenError()
    }
    return true
  }
}

export function ForbidAssistant(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(ForbidAssistantGuard))
}
