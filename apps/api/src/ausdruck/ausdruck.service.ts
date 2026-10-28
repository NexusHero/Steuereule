// The Formular-Ausdruck (ADR-0050): the paid, printable return for one tax year. Gates in
// order — a year we hold measured templates for, a paid unlock, a complete Hauptvordruck —
// each with its own honest answer instead of a half-filled printout.
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { CH_LOHNAUSWEIS_REPOSITORY, type ChLohnausweisRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { FreischaltungService } from '../freischaltung/freischaltung.service.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { STAMMDATEN_REPOSITORY, type StammdatenRepository } from '../stammdaten/stammdaten.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { ausdruckWerte } from './ausdruck-werte.js'
import { FELDSAETZE, rendereVordrucke, UeberlaufFehler } from './vordruck-renderer.js'

export const VORLAGEN_BASIS = Symbol('VORLAGEN_BASIS')

@Injectable()
export class AusdruckService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profile: ProfileRepository,
    @Inject(STAMMDATEN_REPOSITORY) private readonly stammdaten: StammdatenRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstb: LstbRepository,
    @Inject(RENTE_REPOSITORY) private readonly rente: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapital: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietung: VermietungRepository,
    @Inject(CH_LOHNAUSWEIS_REPOSITORY) private readonly chLohnausweis: ChLohnausweisRepository,
    @Inject(FreischaltungService) private readonly freischaltung: FreischaltungService,
    @Inject(AuditService) private readonly audit: AuditService,
    /** Directory containing one `<jahr>/` folder of templates per supported year. */
    @Inject(VORLAGEN_BASIS) private readonly vorlagenBasis: URL,
  ) {}

  /** Everything that would stop the printout, before anyone pays for it. */
  async pruefe(userId: string, jahr: number): Promise<{ fehlend: string[] }> {
    if (!FELDSAETZE[jahr]) throw new NotFoundException(`Für das Steuerjahr ${jahr} liegen noch keine Vordrucke vor.`)
    return { fehlend: (await this.sammle(userId, jahr)).fehlend }
  }

  /** Paying is only offered for a printout that can actually be delivered. */
  async starteCheckout(userId: string, jahr: number): Promise<{ checkoutUrl: string }> {
    const { fehlend } = await this.pruefe(userId, jahr)
    if (fehlend.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', fehlend })
    }
    return this.freischaltung.starteCheckout(userId, jahr)
  }

  async erstelle(userId: string, jahr: number): Promise<Uint8Array> {
    const feldsatz = FELDSAETZE[jahr]
    if (!feldsatz) throw new NotFoundException(`Für das Steuerjahr ${jahr} liegen noch keine Vordrucke vor.`)

    if ((await this.freischaltung.status(userId, jahr)) !== 'freigeschaltet') {
      throw new HttpException(`Der Ausdruck für ${jahr} ist noch nicht freigeschaltet.`, HttpStatus.PAYMENT_REQUIRED)
    }

    const { werte, fehlend } = await this.sammle(userId, jahr)
    if (fehlend.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', fehlend })
    }

    try {
      const pdf = await rendereVordrucke(feldsatz, werte, { vorlagenVerzeichnis: new URL(`${jahr}/`, this.vorlagenBasis) })
      await this.audit.append({ userId, action: 'READ', resource: 'ausdruck' })
      return pdf
    } catch (fehler) {
      if (fehler instanceof UeberlaufFehler) {
        throw new UnprocessableEntityException({ message: 'Eine Angabe ist zu lang für ihr Feld.', zuLang: fehler.felder })
      }
      throw fehler
    }
  }

  private async sammle(userId: string, jahr: number) {
    const [profil, stammdaten, lstb, rente, kapital, objekte, ch] = await Promise.all([
      this.profile.findByUserId(userId),
      this.stammdaten.findByUserId(userId),
      this.lstb.findForUserAndYear(userId, jahr),
      this.rente.findForUserAndYear(userId, jahr),
      this.kapital.findForUserAndYear(userId, jahr),
      this.vermietung.listForUserAndYear(userId, jahr),
      this.chLohnausweis.findForUserAndYear(userId, jahr),
    ])
    const nochNichtDruckbar: ('anlageV' | 'anlageKap' | 'anlageNGre')[] = []
    if (objekte.length > 0) nochNichtDruckbar.push('anlageV')
    if (kapital?.kapitalertraege) nochNichtDruckbar.push('anlageKap')
    if (ch) nochNichtDruckbar.push('anlageNGre')
    return ausdruckWerte({
      profil: {
        firstName: profil?.firstName ?? null,
        lastName: profil?.lastName ?? null,
        steuerId: profil?.steuerId ?? null,
        steuernummer: profil?.steuernummer ?? null,
      },
      stammdaten,
      bruttoarbeitslohn: lstb?.bruttoarbeitslohn ?? null,
      rente: rente ? { rentenart: rente.rentenart, jahresbetrag: rente.jahresbetrag } : null,
      nochNichtDruckbar,
    })
  }
}
