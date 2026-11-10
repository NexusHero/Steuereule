import { Module } from '@nestjs/common'
import { KeystoreModule } from '../keystore/keystore.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RECEIPT_REPOSITORY } from './receipt.repository.js'
import { PrismaReceiptRepository } from './receipt.repository.prisma.js'
import { EnvelopeCryptoService } from './storage/envelope-crypto.service.js'
import { PostgresByteaStorageAdapter } from './storage/postgres-bytea-storage.adapter.js'
import { STORAGE_PORT } from './storage/storage.port.js'

@Module({
  imports: [PrismaModule, KeystoreModule],
  providers: [
    EnvelopeCryptoService,
    PostgresByteaStorageAdapter,
    { provide: STORAGE_PORT, useExisting: PostgresByteaStorageAdapter },
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
  ],
  exports: [RECEIPT_REPOSITORY, STORAGE_PORT, EnvelopeCryptoService],
})
export class ReceiptStorageModule {}
