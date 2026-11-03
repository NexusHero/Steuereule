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
import { afaSatzProzent } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { CH_LOHNAUSWEIS_REPOSITORY, type ChLohnausweisRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { FreischaltungService } from '../freischaltung/freischaltung.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { KIND_REPOSITORY, type KindRepository } from '../kinder/kind.repository.js'
import { KOPPLUNG_REPOSITORY, type KopplungRepository } from '../kopplung/kopplung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { STAMMDATEN_REPOSITORY, type StammdatenRepository } from '../stammdaten/stammdaten.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { ausdruckWerte, type PersonBFakten } from './ausdruck-werte.js'
import { FELDSAETZE, rendereVordrucke, UeberlaufFehler } from './vordruck-renderer.js'

export const VORLAGEN_BASIS = Symbol('VORLAGEN_BASIS')

function chfZuEurString(rawChf: string | null | undefined, kurs: number | null | undefined): string | null {
  if (!rawChf || !/^\d+$/.test(rawChf)) return null
  const chf = Number(rawChf)
  if (kurs && kurs > 0) {
    return String(Math.round(chf * kurs))
  }
  return rawChf
}

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
    @Inject(KIND_REPOSITORY) private readonly kinder: KindRepository,
    @Inject(KOPPLUNG_REPOSITORY) private readonly kopplung: KopplungRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
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

    const { werte, instanzen, fehlend } = await this.sammle(userId, jahr)
    if (fehlend.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', fehlend })
    }

    try {
      const pdf = await rendereVordrucke(feldsatz, werte, {
        vorlagenVerzeichnis: new URL(`${jahr}/`, this.vorlagenBasis),
        instanzen,
      })
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
    const [profil, stammdaten, lstb, rente, kapital, objekte, ch, kinder, kopplung, interviewRows] = await Promise.all([
      this.profile.findByUserId(userId),
      this.stammdaten.findByUserId(userId),
      this.lstb.findForUserAndYear(userId, jahr),
      this.rente.findForUserAndYear(userId, jahr),
      this.kapital.findForUserAndYear(userId, jahr),
      this.vermietung.listForUserAndYear(userId, jahr),
      this.chLohnausweis.findForUserAndYear(userId, jahr),
      this.kinder.listForUserAndYear(userId, jahr),
      this.kopplung.findByUserAndYear(userId, jahr),
      this.interview.findAllForUserAndYear(userId, jahr),
    ])

    const answers: Record<string, string> = {}
    for (const row of interviewRows) answers[row.questionId] = row.value

    let personBFakten: PersonBFakten | null = null
    if (kopplung?.veranlagungsart === 'zusammen' && kopplung.personBUserId) {
      const spouseId = kopplung.personAUserId === userId ? kopplung.personBUserId : kopplung.personAUserId
      const [spouseProf, spouseSd, spouseLstb, spouseRente] = await Promise.all([
        this.profile.findByUserId(spouseId),
        this.stammdaten.findByUserId(spouseId),
        this.lstb.findForUserAndYear(spouseId, jahr),
        this.rente.findForUserAndYear(spouseId, jahr),
      ])
      personBFakten = {
        firstName: spouseProf?.firstName ?? null,
        lastName: spouseProf?.lastName ?? null,
        steuerId: spouseProf?.steuerId ?? null,
        geburtsdatum: spouseSd?.geburtsdatum ?? null,
        religion: spouseSd?.religion ?? null,
        beruf: spouseSd?.beruf ?? null,
        bruttoarbeitslohn: spouseLstb?.bruttoarbeitslohn ?? null,
        rente: spouseRente ? { rentenart: spouseRente.rentenart, jahresbetrag: spouseRente.jahresbetrag } : null,
      }
    }

    const vermietungFakten = objekte.map((obj, i) => {
      let afaStr: string | null = null
      if (obj.anschaffungskosten && obj.baujahr && /^\d+$/.test(obj.anschaffungskosten) && /^\d+$/.test(obj.baujahr)) {
        const satz = afaSatzProzent(Number(obj.baujahr))
        if (satz !== null) {
          afaStr = String(Math.round(Number(obj.anschaffungskosten) * (satz / 100)))
        }
      }
      return {
        lfdNr: String(i + 1),
        strasse: [obj.strasse, obj.hausnummer].filter(Boolean).join(' ') || null,
        plz: obj.plz ?? null,
        ort: obj.ort ?? null,
        wohnflaeche: obj.wohnflaeche ?? null,
        mieteinnahmen: obj.mieteinnahmen,
        afa: afaStr,
        werbungskosten: obj.werbungskosten,
      }
    })

    const kinderFakten = kinder.map((k, i) => ({
      lfdNr: String(i + 1),
      vorname: k.vorname,
      nachname: k.nachname,
      geburtsdatum: k.geburtsdatum,
      idnr: k.idnr,
      kindergeldAnspruchEur: k.kindergeldAnspruchEur,
      kindschaftsverhaeltnis: k.kindschaftsverhaeltnis,
      kindschaftsverhaeltnisB: k.kindschaftsverhaeltnisB,
      familienkasse: k.familienkasse,
      wohnsitzInlandGanzjaehrig: k.wohnsitzInlandGanzjaehrig,
    }))

    return ausdruckWerte({
      steuerjahr: jahr,
      profil: {
        firstName: profil?.firstName ?? null,
        lastName: profil?.lastName ?? null,
        steuerId: profil?.steuerId ?? null,
        steuernummer: profil?.steuernummer ?? null,
      },
      stammdaten,
      bruttoarbeitslohn: lstb?.bruttoarbeitslohn ?? null,
      rente: rente ? { rentenart: rente.rentenart, jahresbetrag: rente.jahresbetrag } : null,
      kapital: kapital ? { kapitalertraege: kapital.kapitalertraege } : null,
      chLohnausweis: ch
        ? {
            bruttolohnEur: chfZuEurString(ch.felder['bruttolohn-total'], ch.wechselkursKurs),
            abzugssteuerEur: chfZuEurString(ch.felder['quellensteuer'], ch.wechselkursKurs),
            vorsorgeEur: chfZuEurString(ch.felder['berufliche-vorsorge'], ch.wechselkursKurs),
            nichtrueckkehrtage: answers['ch-nichtrueckkehrtage'] ?? null,
          }
        : null,
      vermietung: vermietungFakten.length > 0 ? vermietungFakten : null,
      kinder: kinderFakten.length > 0 ? kinderFakten : null,
      kopplung: kopplung ? { veranlagungsart: kopplung.veranlagungsart, personB: personBFakten } : null,
      sonderausgaben: answers['spenden-betrag'] ? { spenden: answers['spenden-betrag'] } : null,
      riester:
        answers['riester'] === 'Ja'
          ? { art: answers['riester-art'] ?? null, einnahmenVorjahr: answers['riester-einnahmen-vorjahr'] ?? null }
          : null,
    })
  }
}
