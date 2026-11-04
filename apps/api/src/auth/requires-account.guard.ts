import { Injectable, UseGuards, applyDecorators, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { GuestCannotUseThisEndpointError } from '../common/account-required.error.js'
import { USER_ID_KIND_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

@Injectable()
export class RequiresAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    if (request[USER_ID_KIND_REQUEST_KEY] !== 'session' && request[USER_ID_KIND_REQUEST_KEY] !== 'bearer') {
      throw new GuestCannotUseThisEndpointError()
    }
    return true
  }
}

export function RequiresAccount(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(RequiresAccountGuard))
}
