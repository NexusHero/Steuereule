import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { FreischaltungModule } from '../freischaltung/freischaltung.module.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { StammdatenModule } from '../stammdaten/stammdaten.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { AusdruckController } from './ausdruck.controller.js'
import { AusdruckService, VORLAGEN_BASIS } from './ausdruck.service.js'

@Module({
  imports: [
    AuditModule,
    ChLohnausweisModule,
    FreischaltungModule,
    KapitalModule,
    LstbModule,
    ProfileModule,
    RenteModule,
    StammdatenModule,
    VermietungModule,
  ],
  controllers: [AusdruckController],
  providers: [
    AusdruckService,
    // Resolves from src/ausdruck and dist/ausdruck alike; the Dockerfile ships the repo.
    { provide: VORLAGEN_BASIS, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
  ],
})
export class AusdruckModule {}
