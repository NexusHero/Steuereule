import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { runAnonymouslyInDatabase, runAsDatabaseUser } from '../common/database-identity.js'
import { PUBLIC_ROUTE } from './public-route.js'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from './user-context.guard.js'

/**
 * Runs the handler, and everything it starts (an owl run, a printout job), as the user `UserContextGuard`
 * established (P11): the row-level policies then let through that user's rows only. Registered first in
 * `AppModule`, so it is the outermost interceptor and every other one already runs as the user. A public route
 * without a session runs anonymously, on purpose; any other route without a user runs with no identity, and its
 * queries are refused (fail closed).
 */
@Injectable()
export class DatabaseIdentityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const userId = context.switchToHttp().getRequest<RequestWithUserId>()[USER_ID_REQUEST_KEY]
    if (typeof userId !== 'string' || userId.length === 0) {
      const handler = typeof context.getHandler === 'function' ? context.getHandler() : undefined
      const isPublic = handler !== undefined && Reflect.getMetadata(PUBLIC_ROUTE, handler) === true
      if (!isPublic) return next.handle()
      return new Observable((subscriber) => runAnonymouslyInDatabase('public-route', () => next.handle().subscribe(subscriber)))
    }
    // The handler is called when `handle()` is subscribed to, so it starts inside the identity's context.
    return new Observable((subscriber) => runAsDatabaseUser(userId, () => next.handle().subscribe(subscriber)))
  }
}
