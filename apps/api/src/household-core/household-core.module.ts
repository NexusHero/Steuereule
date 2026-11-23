import { Module } from '@nestjs/common'
import { KeystoreModule } from '../keystore/keystore.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { EnvelopeCryptoService } from '../receipt/storage/envelope-crypto.service.js'
import { HOUSEHOLD_REPOSITORY } from './household.repository.js'
import { PrismaHouseholdRepository } from './household.repository.prisma.js'
import { HouseholdAccessService } from './household-access.service.js'
import { PersonSealService } from './person-seal.service.js'

/** Household storage and sealing, without the services that depend on Kinder/Kopplung (no cycles). */
@Module({
  imports: [PrismaModule, KeystoreModule],
  providers: [EnvelopeCryptoService, PersonSealService, HouseholdAccessService, { provide: HOUSEHOLD_REPOSITORY, useClass: PrismaHouseholdRepository }],
  exports: [HOUSEHOLD_REPOSITORY, PersonSealService, HouseholdAccessService],
})
export class HouseholdCoreModule {}
