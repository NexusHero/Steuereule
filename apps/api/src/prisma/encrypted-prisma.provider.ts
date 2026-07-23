// The extended-client seam for field-level encryption (ADR-0008). Deliberately NOT
// built inside PrismaService itself: `$extends()` returns a new, differently-typed
// client instance, and building it there would mean either (a) PrismaService starts
// handing out a second, incompatible client shape, or (b) PrismaService's own
// `this` gets reassigned to the extended client, which breaks its `onModuleDestroy`
// `$disconnect()` lifecycle (the extended client is a distinct proxy object, not the
// same `this`). Instead this is a plain Nest provider: it takes the *connection*
// (PrismaService, unchanged) and returns the *encrypted* client as a separate,
// explicitly-injected value. PrismaProfileRepository (and any future repository
// touching an `/// @encrypted` field) injects ENCRYPTED_PRISMA, never PrismaService,
// for its actual queries.
import type { FactoryProvider } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { resolveFieldEncryptionKey } from './field-encryption-key.js'
import { PrismaService } from './prisma.service.js'

export const ENCRYPTED_PRISMA = Symbol('ENCRYPTED_PRISMA')

// prisma-field-encryption's own .d.ts types $extends()'s result generically (an empty
// InternalArgs), so it doesn't carry our concrete Profile/TaxDataAccessLog model
// delegates through — a known limitation; the library's own README documents the same
// "explicit cast" workaround for its migration helper. At runtime the extension is a
// pure `$allModels`/`$allOperations` query wrapper: it adds no models and changes no
// method signatures, so casting back to the generated PrismaClient shape is safe and
// keeps every call site (PrismaProfileRepository, PrismaAuditRepository) fully typed.
export type EncryptedPrismaClient = PrismaClient

export const encryptedPrismaProvider: FactoryProvider<EncryptedPrismaClient> = {
  provide: ENCRYPTED_PRISMA,
  inject: [PrismaService],
  useFactory: (prisma: PrismaService): EncryptedPrismaClient => {
    const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
    const extended = prisma.$extends(fieldEncryptionExtension({ encryptionKey, decryptionKeys }))
    return extended as unknown as PrismaClient
  },
}
