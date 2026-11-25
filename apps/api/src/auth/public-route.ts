import { SetMetadata } from '@nestjs/common'

export const PUBLIC_ROUTE = 'steuereule:publicRoute'

/**
 * A route that reads nobody's data (H2-17): `UserContextGuard` establishes no identity for it, so a call without
 * a cookie does not create a guest and set a cookie as a side effect.
 */
export const PublicRoute = (): MethodDecorator => SetMetadata(PUBLIC_ROUTE, true)
