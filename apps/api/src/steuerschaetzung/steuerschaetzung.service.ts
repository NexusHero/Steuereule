import { Inject, Injectable } from '@nestjs/common'
import {
  anlageNGreBetraege,
  angestellteAusAntworten,
  calculateWorkdays,
  chfNachEur,
  gatedIncomeTypes,
  wageTaxCertificateStatus,
  offeneLohnausweisFelder,
  commuterAllowance,
  steuerschaetzungAngestellt,
  steuerschaetzungGrenzgaenger,
  depreciationRatePercent,
  claimMonths,
  estimateMarriedCouple,
  monthlyChildBenefitClaim,
  type Answers,
  type SpouseIncome,
  type Steuerschaetzung,
} from '@steuereule/core'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from '../arbeitsweg/arbeitsweg.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { grenzgaengerStatusAusAnswers, lohnausweisWerteAusRecord, wechselkursAusRecord } from '../ch-lohnausweis/lohnausweis-daten.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-daten.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../stammdaten/stammdaten.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../kinder/kind.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../kopplung/kopplung.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'

export type SteuerschaetzungStand =
  | (Extract<Steuerschaetzung, { kind: 'spanne' }> & { readonly kirchensteuerOffen: boolean; readonly zusammenveranlagung?: boolean })
  | { readonly kind: 'offen'; readonly fehlt: readonly string[] }
  | { readonly kind: 'nicht-moeglich'; readonly grund: string }

const CH_AUSLAND = 'Ja, in die Schweiz'

/** Ranged refund / back-payment estimate from everything the user has entered for one tax year (product ADR-015). */
@Injectable()
export class TaxEstimateService {
  constructor(
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstb: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chLohnausweis: CrossBorderSalaryStatementRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly stammdaten: MasterDataRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly arbeitsweg: CommuteRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly kopplung?: PartnerCouplingRepository,
    @Inject(CHILD_REPOSITORY) private readonly kinder?: ChildRepository,
    @Inject(RENTAL_REPOSITORY) private readonly vermietung?: RentalRepository,
  ) {}

  async getState(userId: string, jahr: number): Promise<SteuerschaetzungStand> {
    const [lstbRecord, interviewRows, chRecord, stammdaten, weg] = await Promise.all([
      this.lstb.findForUserAndYear(userId, jahr),
      this.interview.findAllForUserAndYear(userId, jahr),
      this.chLohnausweis.findForUserAndYear(userId, jahr),
      this.stammdaten.findByUserId(userId),
      this.arbeitsweg.findForUserAndYear(userId, jahr),
    ])
    const answers = answersFrom(interviewRows)

    if (answers.job !== 'Angestellt') return { kind: 'nicht-moeglich', grund: 'nur-angestellte' }
    if (stammdaten?.familienstand === 'verheiratet' || answers.familienstand === 'Verheiratet') {
      return this.ehepaar(userId, jahr)
    }
    if (gatedIncomeTypes(answers).length > 0 || besondereLebenslage(answers)) {
      return { kind: 'nicht-moeglich', grund: 'besondere-lebenslage' }
    }

    const zahlen = angestellteAusAntworten(answers)
    const pauschale = pendlerpauschaleAus(jahr, weg)
    const kirchensteuerOffen = stammdaten?.religion !== undefined && stammdaten?.religion !== null && stammdaten.religion !== 'VD'

    if (answers.ausland === CH_AUSLAND) {
      const werte = lohnausweisWerteAusRecord(chRecord)
      const wechselkurs = wechselkursAusRecord(chRecord)
      const status = grenzgaengerStatusAusAnswers(answers)
      const nGre = chRecord?.nGre
      const fehlt = [
        ...(status === null ? ['grenzgaenger-status'] : offeneLohnausweisFelder(werte, status)),
        ...(wechselkurs === null ? ['wechselkurs'] : []),
        ...(nGre?.pkArbeitnehmerChf === null || nGre?.pkArbeitnehmerChf === undefined ? ['pk-obligatorium'] : []),
      ]
      if (fehlt.length > 0 || wechselkurs === null || nGre === undefined) return { kind: 'offen', fehlt }
      const zeilen = anlageNGreBetraege({
        bruttolohnChf: werte['bruttolohn-total'] ?? 0,
        familienzulagenChf: Number(nGre.familienzulagenChf ?? 0),
        ahvBeitraegeChf: werte['ahv-beitraege'] ?? 0,
        quellensteuerChf: werte.quellensteuer ?? 0,
        krankentaggeldChf: Number(nGre.krankentaggeldChf ?? 0),
        pkArbeitnehmerChf: Number(nGre.pkArbeitnehmerChf ?? 0),
        pkArbeitgeberChf: Number(nGre.pkArbeitgeberChf ?? 0),
        krankentaggeldArbeitgeberProzent: optionaleZahl(nGre.krankentaggeldArbeitgeberProzent),
        krankentaggeldArbeitgeberChf: optionaleZahl(nGre.krankentaggeldArbeitgeberChf),
        nbuvArbeitgeberProzent: optionaleZahl(nGre.nbuvArbeitgeberProzent),
        nbuvArbeitgeberChf: optionaleZahl(nGre.nbuvArbeitgeberChf),
        kurs: wechselkurs.kurs,
      }).eur
      const krankenkasseChf = chRecord?.krankenkasseChf === null || chRecord?.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      return mitKirchensteuer(
        steuerschaetzungGrenzgaenger({
          jahr,
          arbeitslohnEur: zeilen.z23,
          quellensteuerEur: zeilen.z25,
          altersvorsorgeEur: zeilen.z85,
          sonstigeVorsorgeEur: zeilen.z82,
          krankenversicherungEur: Math.round(chfNachEur(krankenkasseChf, wechselkurs.kurs)) + zahlen.kvPvBeitraege,
          pendlerpauschale: pauschale,
          spenden: zahlen.spenden,
        }),
        kirchensteuerOffen,
      )
    }

    const zustand = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (zustand.kind === 'unvollstaendig') return { kind: 'offen', fehlt: [...zustand.offen, ...zustand.unklar] }
    if (zustand.kind === 'widerspruch') return { kind: 'offen', fehlt: zustand.widersprueche.map((w) => w.art) }
    return mitKirchensteuer(
      steuerschaetzungAngestellt({
        jahr,
        bruttoarbeitslohn: zustand.bruttoarbeitslohn,
        lohnsteuer: zustand.lohnsteuer,
        sozialversicherung: zustand.sozialversicherung,
        pendlerpauschale: pauschale,
        weitereWerbungskosten: zahlen.umzugKosten,
        spenden: zahlen.spenden,
        selbstGezahlteKvPv: zahlen.kvPvBeitraege,
      }),
      kirchensteuerOffen,
    )
  }

  /** ADR-0054: a couple's estimate from both spouses' figures — only once the joint return for the year is set up. */
  private async ehepaar(userId: string, jahr: number): Promise<SteuerschaetzungStand> {
    const kopplung = this.kopplung ? await this.kopplung.findByUserAndYear(userId, jahr) : null
    if (!kopplung || kopplung.veranlagungsart !== 'zusammen') return { kind: 'offen', fehlt: ['veranlagungsart'] }
    const [a, b] = await Promise.all([
      this.einkommen(kopplung.personAUserId, jahr),
      kopplung.personBUserId ? this.einkommen(kopplung.personBUserId, jahr) : Promise.resolve(null),
    ])
    const fehlt = [...(a?.kind === 'offen' ? a.fehlt : []), ...(b?.kind === 'offen' ? b.fehlt.map((f) => `personB.${f}`) : [])]
    if (a === null) fehlt.unshift('einkommen')
    if (fehlt.length > 0 || a?.kind !== 'ok') return { kind: 'offen', fehlt }
    const [kinder, objekte, sdA, sdB] = await Promise.all([
      this.kinder ? this.kinder.listForUserAndYear(kopplung.personAUserId, jahr) : Promise.resolve([]),
      this.vermietung ? this.vermietung.listForUserAndYear(kopplung.personAUserId, jahr) : Promise.resolve([]),
      this.stammdaten.findByUserId(kopplung.personAUserId),
      kopplung.personBUserId ? this.stammdaten.findByUserId(kopplung.personBUserId) : Promise.resolve(null),
    ])
    const kirche = (religion: string | null | undefined) => religion !== undefined && religion !== null && religion !== 'VD'
    const schaetzung = estimateMarriedCouple({
      year: jahr,
      a: a.spouse,
      b: b?.kind === 'ok' ? b.spouse : null,
      children: kinder.length,
      childBenefit: kinder.reduce((sum, k) => sum + monthlyChildBenefitClaim(jahr) * claimMonths(k.geburtsdatum, jahr), 0),
      rentalSurplus: objekte.reduce((sum, o) => sum + vermietungsUeberschuss(o), 0),
      donations: a.spenden + (b?.kind === 'ok' ? b.spenden : 0),
      churchMember: kirche(sdA?.religion) || kirche(sdB?.religion),
    })
    if (schaetzung.kind !== 'spanne') return { kind: 'nicht-moeglich', grund: schaetzung.grund }
    const { childAllowanceUsed: _k, churchTax: _c, churchTaxOpen, ...spanne } = schaetzung
    return { ...spanne, kirchensteuerOffen: churchTaxOpen, zusammenveranlagung: true }
  }

  /** One spouse's wage income for the couple estimate; null when they have none. */
  private async einkommen(
    userId: string,
    jahr: number,
  ): Promise<{ kind: 'ok'; spouse: SpouseIncome; spenden: number } | { kind: 'offen'; fehlt: string[] } | null> {
    const [lstbRecord, interviewRows, chRecord, weg] = await Promise.all([
      this.lstb.findForUserAndYear(userId, jahr),
      this.interview.findAllForUserAndYear(userId, jahr),
      this.chLohnausweis.findForUserAndYear(userId, jahr),
      this.arbeitsweg.findForUserAndYear(userId, jahr),
    ])
    const answers = answersFrom(interviewRows)
    const zahlen = angestellteAusAntworten(answers)
    const pauschale = pendlerpauschaleAus(jahr, weg)
    if (chRecord && (answers.ausland === CH_AUSLAND || lstbRecord === null)) {
      const werte = lohnausweisWerteAusRecord(chRecord)
      const wechselkurs = wechselkursAusRecord(chRecord)
      const nGre = chRecord.nGre
      const fehlt = [...(wechselkurs === null ? ['wechselkurs'] : []), ...(nGre.pkArbeitnehmerChf === null ? ['pk-obligatorium'] : [])]
      if (werte['bruttolohn-total'] === undefined) fehlt.unshift('bruttolohn-total')
      if (fehlt.length > 0 || wechselkurs === null) return { kind: 'offen', fehlt }
      const zeilen = anlageNGreBetraege({
        bruttolohnChf: werte['bruttolohn-total'] ?? 0,
        familienzulagenChf: Number(nGre.familienzulagenChf ?? 0),
        ahvBeitraegeChf: werte['ahv-beitraege'] ?? 0,
        quellensteuerChf: werte.quellensteuer ?? 0,
        krankentaggeldChf: Number(nGre.krankentaggeldChf ?? 0),
        pkArbeitnehmerChf: Number(nGre.pkArbeitnehmerChf ?? 0),
        pkArbeitgeberChf: Number(nGre.pkArbeitgeberChf ?? 0),
        krankentaggeldArbeitgeberProzent: optionaleZahl(nGre.krankentaggeldArbeitgeberProzent),
        krankentaggeldArbeitgeberChf: optionaleZahl(nGre.krankentaggeldArbeitgeberChf),
        nbuvArbeitgeberProzent: optionaleZahl(nGre.nbuvArbeitgeberProzent),
        nbuvArbeitgeberChf: optionaleZahl(nGre.nbuvArbeitgeberChf),
        kurs: wechselkurs.kurs,
      }).eur
      const krankenkasseChf = chRecord.krankenkasseChf === null || chRecord.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      return {
        kind: 'ok',
        spenden: zahlen.spenden,
        spouse: {
          kind: 'crossBorder',
          wageEur: zeilen.z23,
          swissWithholdingEur: zeilen.z25,
          pensionContributionsEur: zeilen.z85,
          otherProvisionEur: zeilen.z82,
          commuteAllowance: pauschale,
          selfPaidHealthCare: Math.round(chfNachEur(krankenkasseChf, wechselkurs.kurs)) + zahlen.kvPvBeitraege,
        },
      }
    }
    if (lstbRecord === null) return null
    const zustand = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (zustand.kind === 'unvollstaendig') return { kind: 'offen', fehlt: [...zustand.offen, ...zustand.unklar] }
    if (zustand.kind === 'widerspruch') return { kind: 'offen', fehlt: zustand.widersprueche.map((w) => w.art) }
    return {
      kind: 'ok',
      spenden: zahlen.spenden,
      spouse: {
        kind: 'employee',
        grossWage: zustand.bruttoarbeitslohn,
        wageTax: zustand.lohnsteuer,
        socialSecurity: zustand.sozialversicherung,
        commuteAllowance: pauschale + zahlen.umzugKosten,
        selfPaidHealthCare: zahlen.kvPvBeitraege,
      },
    }
  }
}

/** Anlage V result of one object as the estimate needs it: rent and Umlagen less costs, interest and linear AfA. */
function vermietungsUeberschuss(o: {
  mieteinnahmen: string | null
  werbungskosten: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  umlagen?: string | null
  schuldzinsen?: string | null
}): number {
  const zahl = (wert: string | null | undefined) => (wert && /^\d+$/.test(wert) ? Number(wert) : 0)
  const satz = o.baujahr && /^\d+$/.test(o.baujahr) ? depreciationRatePercent(Number(o.baujahr)) : null
  const afa = satz === null ? 0 : Math.round((zahl(o.anschaffungskosten) * satz) / 100)
  return zahl(o.mieteinnahmen) + zahl(o.umlagen) - zahl(o.werbungskosten) - zahl(o.schuldzinsen) - afa
}

/** A stored optional number; absent and null both mean "not entered". */
function optionaleZahl(wert: string | null | undefined): number | undefined {
  return wert === null || wert === undefined ? undefined : Number(wert)
}

function besondereLebenslage(answers: Answers): boolean {
  return answers.dhf === 'Ja' || answers.abfindung === 'Ja' || answers.lohnersatz === 'Ja' || answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob'
}

function pendlerpauschaleAus(jahr: number, weg: CommuteInputs | null): number {
  if (weg === null || weg.einfacheKm === null || weg.verkehrsmittel === null) return 0
  const tage = calculateWorkdays({
    year: jahr,
    workdays: weg.arbeitstage,
    vacationDays: weg.urlaubstage,
    sickDays: weg.krankheitstage,
    homeOfficeDays: weg.homeofficeTage,
    publicHolidays: weg.feiertage ?? 0,
  })
  if (tage.kind !== 'bestimmt') return 0
  try {
    return commuterAllowance({ oneWayKm: weg.einfacheKm, days: tage.pendlertage, year: jahr, withCar: weg.verkehrsmittel === 'pkw' })
  } catch {
    return 0
  }
}

function mitKirchensteuer(schaetzung: Steuerschaetzung, kirchensteuerOffen: boolean): SteuerschaetzungStand {
  if (schaetzung.kind !== 'spanne') return { kind: 'nicht-moeglich', grund: schaetzung.grund }
  return { ...schaetzung, kirchensteuerOffen }
}
