import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SCREENS, type Screen } from '@steuereule/core'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { AUTH_CONTEXT_REQUEST_KEY, USER_ID_REQUEST_KEY, type RequestWithUserId } from '../auth/user-context.guard.js'
import { USER_WRITE_SCREENS } from '../common/user-write.decorator.js'
import { UserWriteMarkings } from './user-write-markings.js'

/** The tax year of a route under `v1/steuerjahre/:jahr`; null for the year-independent masks (Profil, Stammdaten). */
function taxYearOf(params: Readonly<Record<string, unknown>> | undefined): number | null {
  const raw = params?.jahr
  return typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : null
}

/**
 * Runs every `@UserWrite` route through `UserWriteMarkings`, so no mask's service can forget „the user wins“.
 *
 * The markings of every mask are settled, not only of the masks the route names: which fields a write changed is
 * read from the data (a marked field whose value differs afterwards), never from a declaration. A route of one
 * mask that also writes another's field (Person B's Grenzgänger answers are interview answers, saved from the
 * Lohnausweis mask) would otherwise leave that field's marking standing. Without unconfirmed assistant values
 * this costs the one query for the markings; with them, one read per marked record.
 */
@Injectable()
export class UserWriteInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(UserWriteMarkings) private readonly markings: UserWriteMarkings,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const screens = this.reflector.getAllAndOverride<readonly Screen[] | undefined>(USER_WRITE_SCREENS, [context.getHandler(), context.getClass()])
    if (screens === undefined || context.getType() !== 'http') return next.handle()
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const userId = request[USER_ID_REQUEST_KEY]
    // Only the user's own session writes as the user; an assistant's token never reaches these routes (ADR-0052 amendment 4).
    if (typeof userId !== 'string' || request[AUTH_CONTEXT_REQUEST_KEY]?.source === 'assistent') return next.handle()
    return from(this.markings.around(userId, taxYearOf(request.params as Readonly<Record<string, unknown>> | undefined), SCREENS, () => lastValueFrom(next.handle(), { defaultValue: undefined })))
  }
}
