import { SetMetadata } from '@nestjs/common'
import type { Screen } from '@steuereule/core'

export const USER_WRITE_SCREENS = 'steuereule:user-write-screens'

/**
 * Marks a route on which the user writes the fields of these masks (ADR-0052 §7): `UserWriteInterceptor`
 * settles their markings around it (`UserWriteMarkings`). Every write route is either marked so or named,
 * with its reason, in the list of `test/user-write-routes.test.ts`.
 */
export const UserWrite = (...screens: readonly [Screen, ...Screen[]]): MethodDecorator & ClassDecorator => SetMetadata(USER_WRITE_SCREENS, screens)
