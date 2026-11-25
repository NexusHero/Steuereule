import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { runAsDatabaseUser } from '../common/database-identity.js'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

/**
 * Runs the handler, and everything it starts (an owl run, a printout job), as the user `UserContextGuard`
 * established (P11): the row-level policies then let through that user's rows only. Registered first in
 * `AppModule`, so it is the outermost interceptor and every other one already runs as the user. A route
 * without the guard has no user and runs with no identity: tables with personal data answer with nothing.
 */
@Injectable()
export class DatabaseIdentityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const userId = context.switchToHttp().getRequest<RequestWithUserId>()[USER_ID_REQUEST_KEY]
    if (typeof userId !== 'string' || userId.length === 0) return next.handle()
    // The handler is called when `handle()` is subscribed to, so it starts inside the identity's context.
    return new Observable((subscriber) => runAsDatabaseUser(userId, () => next.handle().subscribe(subscriber)))
  }
}
