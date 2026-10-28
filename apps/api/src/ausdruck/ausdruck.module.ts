import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { FreischaltungModule } from '../freischaltung/freischaltung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { StammdatenModule } from '../stammdaten/stammdaten.module.js'
import { AusdruckController } from './ausdruck.controller.js'
import { AusdruckService, VORLAGEN_BASIS } from './ausdruck.service.js'

@Module({
  imports: [AuditModule, FreischaltungModule, LstbModule, ProfileModule, StammdatenModule],
  controllers: [AusdruckController],
  providers: [
    AusdruckService,
    // Resolves from src/ausdruck and dist/ausdruck alike; the Dockerfile ships the repo.
    { provide: VORLAGEN_BASIS, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
  ],
})
export class AusdruckModule {}
