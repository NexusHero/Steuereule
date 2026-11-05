import { Module } from '@nestjs/common'
import { ArbeitswegModule } from '../arbeitsweg/arbeitsweg.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KinderModule } from '../kinder/kinder.module.js'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { StammdatenModule } from '../stammdaten/stammdaten.module.js'
import { SteuerschaetzungController } from './steuerschaetzung.controller.js'
import { SteuerschaetzungService } from './steuerschaetzung.service.js'

@Module({
  imports: [LstbModule, InterviewModule, ChLohnausweisModule, StammdatenModule, ArbeitswegModule, KopplungModule, KinderModule, VermietungModule],
  controllers: [SteuerschaetzungController],
  providers: [SteuerschaetzungService],
})
export class SteuerschaetzungModule {}
