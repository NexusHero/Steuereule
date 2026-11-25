import { SetMetadata } from '@nestjs/common'
import type { Screen } from '@steuereule/core'

export const USER_WRITE_SCREENS = 'steuereule:user-write-screens'

/**
 * Marks a route on which the user writes mask fields (ADR-0052 §7): `UserWriteInterceptor` settles the
 * assistant's markings around it (`UserWriteMarkings`). The masks named say what the route is for; the
 * interceptor compares the marked fields of every mask, so a list that misses one cannot leave a marking
 * standing. Every write route is either marked so or named, with its reason, in the list of
 * `test/user-write-routes.test.ts`.
 */
export const UserWrite = (...screens: readonly [Screen, ...Screen[]]): MethodDecorator & ClassDecorator => SetMetadata(USER_WRITE_SCREENS, screens)
