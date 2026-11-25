import { ApiExtension } from '@nestjs/swagger'

/** The OpenAPI extension on a write operation that removes stored data or makes something final. */
export const DESTRUCTIVE_EXTENSION = 'x-destructive'

/**
 * Marks a POST or PUT route that removes stored data or makes something final (a Storno, a Festschreibung, a
 * discarded proposal). A DELETE route is destructive by its method and needs no mark. The web app reads the
 * marked operations and every DELETE from openapi.json; its lock (`apps/mobile-web/src/confirm/
 * destructiveActions.lock.test.tsx`) fails when a screen calls one of them without asking first.
 */
export const Destructive = (): MethodDecorator => ApiExtension(DESTRUCTIVE_EXTENSION, true)
