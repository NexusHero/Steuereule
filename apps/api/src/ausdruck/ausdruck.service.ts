import { HttpException, HttpStatus, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { NotFoundError } from '../common/domain-error.js'
import { CH_WOHNSITZ_VALUES, JAHRESUNABHAENGIG, fehlendeBestaetigungen, grenzgaengerStatus, ordneKapDepotEin, type ChWohnsitz, type GrenzgaengerStatus } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { CH_LOHNAUSWEIS_REPOSITORY, type ChLohnausweisRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { FreischaltungService } from '../freischaltung/freischaltung.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { KIND_REPOSITORY, type KindRepository } from '../kinder/kind.repository.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { KOPPLUNG_REPOSITORY, type KopplungRepository } from '../kopplung/kopplung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { STAMMDATEN_REPOSITORY, type StammdatenRepository } from '../stammdaten/stammdaten.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { ausdruckWerte, type PersonBFakten } from './ausdruck-werte.js'
import { FELDSAETZE, rendereVordrucke, UeberlaufFehler } from './vordruck-renderer.js'

export const VORLAGEN_BASIS = Symbol('VORLAGEN_BASIS')

function grenzgaengerStatusAus(answers: Record<string, string>): GrenzgaengerStatus | null {
  const wohnsitz = answers['ch-wohnsitz']
  const tage = answers['ch-nichtrueckkehrtage']
  if (!(CH_WOHNSITZ_VALUES as readonly string[]).includes(wohnsitz ?? '')) return null
  if (wohnsitz === 'Schweiz') return 'kein-grenzgaenger'
  return tage && /^\d+$/.test(tage) ? grenzgaengerStatus(wohnsitz as ChWohnsitz, Number(tage)) : null
}

/** The Formular-Ausdruck: the paid, printable return for one tax year. */
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
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly kennzeichnungen: KennzeichnungRepository,
    @Inject(FreischaltungService) private readonly freischaltung: FreischaltungService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(VORLAGEN_BASIS) private readonly vorlagenBasis: URL,
  ) {}

  async pruefe(userId: string, jahr: number): Promise<{ fehlend: string[] }> {
    if (!FELDSAETZE[jahr]) throw new NotFoundError('VORDRUCKE_MISSING', `No Vordrucke are available for tax year ${jahr} yet.`)
    return { fehlend: (await this.sammle(userId, jahr)).fehlend }
  }

  async starteCheckout(userId: string, jahr: number): Promise<{ checkoutUrl: string }> {
    const { fehlend } = await this.pruefe(userId, jahr)
    if (fehlend.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', fehlend })
    }
    return this.freischaltung.starteCheckout(userId, jahr)
  }

  async erstelle(userId: string, jahr: number, { bearbeitbar = false }: { bearbeitbar?: boolean } = {}): Promise<Uint8Array> {
    const feldsatz = FELDSAETZE[jahr]
    if (!feldsatz) throw new NotFoundError('VORDRUCKE_MISSING', `No Vordrucke are available for tax year ${jahr} yet.`)

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
        bearbeitbar,
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

  private async unbestaetigt(userId: string, jahr: number, personBUserId: string | null): Promise<string[]> {
    const jahre = [jahr, JAHRESUNABHAENGIG]
    const eigene = fehlendeBestaetigungen((await this.kennzeichnungen.listForUserAndYears(userId, jahre)).map((k) => ({ ...k, wert: null })))
    if (personBUserId === null) return eigene
    const personB = fehlendeBestaetigungen((await this.kennzeichnungen.listForUserAndYears(personBUserId, jahre)).map((k) => ({ ...k, wert: null })))
    return personB.length > 0 ? [...eigene, 'unbestaetigt.personB'] : eigene
  }

  private async sammle(userId: string, jahr: number) {
    const [werte, kopplung] = await Promise.all([this.sammleWerte(userId, jahr), this.kopplung.findByUserAndYear(userId, jahr)])
    const personBUserId =
      kopplung?.veranlagungsart === 'zusammen' && kopplung.personBUserId
        ? kopplung.personAUserId === userId
          ? kopplung.personBUserId
          : kopplung.personAUserId
        : null
    return { ...werte, fehlend: [...werte.fehlend, ...(await this.unbestaetigt(userId, jahr, personBUserId))] }
  }

  private async sammleWerte(userId: string, jahr: number) {
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

    const vermietungFakten = objekte.map((obj, i) => ({
      lfdNr: String(i + 1),
      strasse: [obj.strasse, obj.hausnummer].filter(Boolean).join(' ') || null,
      plz: obj.plz ?? null,
      ort: obj.ort ?? null,
      wohnflaeche: obj.wohnflaeche ?? null,
      mieteinnahmen: obj.mieteinnahmen,
      anschaffungskosten: obj.anschaffungskosten,
      baujahr: obj.baujahr,
      werbungskosten: obj.werbungskosten,
      afaWieVorjahr: obj.afaWieVorjahr ?? null,
    }))

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
      andererElternteil: k.andererElternteil,
      andererElternteilName: k.andererElternteilName,
      andererElternteilGeburtsdatum: k.andererElternteilGeburtsdatum,
      andererElternteilAdresse: k.andererElternteilAdresse,
      andererElternteilArt: k.andererElternteilArt,
      andererElternteilVerstorbenAm: k.andererElternteilVerstorbenAm,
      gemeldetBeiMirGanzjaehrig: k.gemeldetBeiMirGanzjaehrig,
      kindergeldAnMichGanzjaehrig: k.kindergeldAnMichGanzjaehrig,
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
      kapital: kapital
        ? {
            depot: ordneKapDepotEin(answers['kap-depot']).kind,
            kapitalertraege: kapital.kapitalertraege,
            sparerPauschbetrag: kapital.sparerPauschbetrag,
            kapitalertragsteuer: kapital.kapitalertragsteuer,
            solidaritaetszuschlag: kapital.solidaritaetszuschlag,
            kirchensteuer: kapital.kirchensteuer,
          }
        : null,
      chLohnausweis: ch
        ? {
            status: grenzgaengerStatusAus(answers),
            kurs: ch.wechselkursKurs,
            bruttolohnChf: ch.felder['bruttolohn-total'],
            ahvBeitraegeChf: ch.felder['ahv-beitraege'],
            quellensteuerChf: ch.felder['quellensteuer'],
            arbeitgeberName: ch.nGre.arbeitgeberName,
            arbeitgeberStrasse: ch.nGre.arbeitgeberStrasse,
            arbeitgeberPlzOrt: ch.nGre.arbeitgeberPlzOrt,
            familienzulagenChf: ch.nGre.familienzulagenChf,
            krankentaggeldChf: ch.nGre.krankentaggeldChf,
            pkArbeitnehmerChf: ch.nGre.pkArbeitnehmerChf,
            pkArbeitgeberChf: ch.nGre.pkArbeitgeberChf,
            sonderfaelle: ch.nGre.nGreSonderfaelle,
          }
        : null,
      vermietung: vermietungFakten.length > 0 ? vermietungFakten : null,
      kinder: kinderFakten.length > 0 ? kinderFakten : null,
      kopplung: kopplung ? { veranlagungsart: kopplung.veranlagungsart, personB: personBFakten } : null,
      sonderausgaben: answers['spenden-betrag'] ? { spenden: answers['spenden-betrag'] } : null,
      alleinerziehend: {
        weiterePerson: answers['ae-weitere-person'] ?? null,
        haushaltsgemeinschaft: answers['ae-haushaltsgemeinschaft'] ?? null,
      },
      riester:
        answers['riester'] === 'Ja'
          ? { art: answers['riester-art'] ?? null, einnahmenVorjahr: answers['riester-einnahmen-vorjahr'] ?? null }
          : null,
    })
  }
}
