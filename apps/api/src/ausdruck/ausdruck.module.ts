import { Module } from '@nestjs/common'
import { ArbeitswegModule } from '../arbeitsweg/arbeitsweg.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { FreischaltungModule } from '../freischaltung/freischaltung.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { StammdatenModule } from '../stammdaten/stammdaten.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { KinderModule } from '../kinder/kinder.module.js'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AusdruckController } from './ausdruck.controller.js'
import { AusdruckService, VORLAGEN_BASIS } from './ausdruck.service.js'

@Module({
  imports: [
    KennzeichnungModule,
    AuditModule,
    ChLohnausweisModule,
    FreischaltungModule,
    InterviewModule,
    KapitalModule,
    LstbModule,
    ProfileModule,
    RenteModule,
    StammdatenModule,
    VermietungModule,
    KinderModule,
    KopplungModule,
    ArbeitswegModule,
  ],
  controllers: [AusdruckController],
  providers: [
    AusdruckService,
    { provide: VORLAGEN_BASIS, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
  ],
})
export class AusdruckModule {}
