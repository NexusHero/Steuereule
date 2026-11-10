import { Module } from '@nestjs/common'
import { USER_KEY_STORE } from './user-key-store.js'
import { PrismaUserKeyStore } from './user-key-store.prisma.js'

/** Dedicated keystore database for receipt-file keys (ADR-0059). */
@Module({
  providers: [{ provide: USER_KEY_STORE, useClass: PrismaUserKeyStore }],
  exports: [USER_KEY_STORE],
})
export class KeystoreModule {}
