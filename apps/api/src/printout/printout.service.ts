import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { HttpException, HttpStatus, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { NotFoundError } from '../common/domain-error.js'
import {
  CH_RESIDENCE_VALUES,
  YEAR_INDEPENDENT,
  amountFromAnswer,
  calculateWorkdays,
  missingConfirmations,
  crossBorderStatus,
  healthInsuranceFromAnswers,
  classifyCapitalDepot,
  type ChResidence,
  type CrossBorderStatus,
  type HealthInsurance,
  effectivePublicHolidays,
} from '@steuereule/core'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from '../commute/commute.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { printoutValues, type CommuteFacts, type ChSalaryCertificateFacts, type PersonBFacts } from './printout-values.js'
import { FIELD_SETS, renderForms, OverflowError } from './form-renderer.js'

export const TEMPLATES_BASE = Symbol('VORLAGEN_BASIS')

function crossBorderStatusFrom(answers: Record<string, string>): CrossBorderStatus | null {
  const residence = answers['ch-wohnsitz']
  const days = answers['ch-nichtrueckkehrtage']
  if (!(CH_RESIDENCE_VALUES as readonly string[]).includes(residence ?? '')) return null
  if (residence === 'Schweiz') return 'kein-grenzgaenger'
  return days && /^\d+$/.test(days) ? crossBorderStatus(residence as ChResidence, Number(days)) : null
}

/** The Formular-Ausdruck: the paid, printable return for one tax year. */
@Injectable()
export class PrintoutService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profile: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterData: MasterDataRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstb: WageTaxCertificateRepository,
    @Inject(PENSION_REPOSITORY) private readonly pension: PensionRepository,
    @Inject(CAPITAL_REPOSITORY) private readonly capital: CapitalRepository,
    @Inject(RENTAL_REPOSITORY) private readonly rental: RentalRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chSalaryCertificate: CrossBorderSalaryStatementRepository,
    @Inject(CHILD_REPOSITORY) private readonly kinder: ChildRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly link: PartnerCouplingRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly commute: CommuteRepository,
    @Inject(UnlockService) private readonly unlock: UnlockService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TEMPLATES_BASE) private readonly templatesBase: URL,
  ) {}

  async check(userId: string, year: number): Promise<{ missing: string[] }> {
    if (!FIELD_SETS[year]) throw new NotFoundError('VORDRUCKE_MISSING', `No Vordrucke are available for tax year ${year} yet.`)
    return { missing: (await this.collect(userId, year)).missing }
  }

  async startCheckout(userId: string, year: number): Promise<{ checkoutUrl: string }> {
    const { missing } = await this.check(userId, year)
    if (missing.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', missing })
    }
    return this.unlock.startCheckout(userId, year)
  }

  async create(userId: string, year: number, { editable = false }: { editable?: boolean } = {}): Promise<Uint8Array> {
    const fieldSet = FIELD_SETS[year]
    if (!fieldSet) throw new NotFoundError('VORDRUCKE_MISSING', `No Vordrucke are available for tax year ${year} yet.`)

    if ((await this.unlock.status(userId, year)) !== 'freigeschaltet') {
      throw new HttpException(`Der Ausdruck für ${year} ist noch nicht freigeschaltet.`, HttpStatus.PAYMENT_REQUIRED)
    }

    const { values, instances, missing } = await this.collect(userId, year)
    if (missing.length > 0) {
      throw new UnprocessableEntityException({ message: 'Für den Ausdruck fehlen noch Angaben.', missing })
    }

    try {
      const pdf = await renderForms(fieldSet, values, {
        templatesDirectory: new URL(`${year}/`, this.templatesBase),
        instances,
        editable,
      })
      await this.audit.append({ userId, action: 'READ', resource: 'ausdruck' })
      return pdf
    } catch (error) {
      if (error instanceof OverflowError) {
        throw new UnprocessableEntityException({ message: 'Eine Angabe ist zu lang für ihr Feld.', tooLong: error.fields })
      }
      throw error
    }
  }

  private async unconfirmed(userId: string, year: number, personBUserId: string | null): Promise<string[]> {
    const years = [year, YEAR_INDEPENDENT]
    const own = missingConfirmations((await this.markings.listForUserAndYears(userId, years)).map((k) => ({ ...k, value: null })))
    if (personBUserId === null) return own
    const personB = missingConfirmations((await this.markings.listForUserAndYears(personBUserId, years)).map((k) => ({ ...k, value: null })))
    return personB.length > 0 ? [...own, 'unbestaetigt.personB'] : own
  }

  private async collect(userId: string, year: number) {
    const link = await this.link.findByUserAndYear(userId, year)
    // ADR-0054: a couple files one return, printed by Person A. Person B sees it but never prints a
    // second one with themselves as Person A.
    if (link?.filingType === 'zusammen' && link.personAUserId !== userId) {
      return { values: {}, instances: {}, missing: ['personADruckt'] }
    }
    const values = await this.collectValues(userId, year)
    const personBUserId = link?.filingType === 'zusammen' && link.personBUserId ? link.personBUserId : null
    return { ...values, missing: [...values.missing, ...(await this.unconfirmed(userId, year, personBUserId))] }
  }

  private async collectValues(userId: string, year: number) {
    const [profile, masterData, lstb, pension, capital, properties, ch, kinder, link, interviewRows, commute] = await Promise.all([
      this.profile.findByUserId(userId),
      this.masterData.findByUserId(userId),
      this.lstb.findForUserAndYear(userId, year),
      this.pension.findForUserAndYear(userId, year),
      this.capital.findForUserAndYear(userId, year),
      this.rental.listForUserAndYear(userId, year),
      this.chSalaryCertificate.findForUserAndYear(userId, year),
      this.kinder.listForUserAndYear(userId, year),
      this.link.findByUserAndYear(userId, year),
      this.interview.findAllForUserAndYear(userId, year),
      this.commute.findForUserAndYear(userId, year),
    ])

    const answers: Record<string, string> = {}
    for (const row of interviewRows) answers[row.questionId] = row.value

    let personBFacts: PersonBFacts | null = null
    let spouseChRecord: Awaited<ReturnType<typeof this.chSalaryCertificate.findForUserAndYear>> = null
    if (link?.filingType === 'zusammen' && link.personBUserId) {
      const spouseId = link.personBUserId
      const [spouseProf, spouseSd, spouseLstb, spousePension, spouseCh, spouseCommute, spouseInterview] = await Promise.all([
        this.profile.findByUserId(spouseId),
        this.masterData.findByUserId(spouseId),
        this.lstb.findForUserAndYear(spouseId, year),
        this.pension.findForUserAndYear(spouseId, year),
        this.chSalaryCertificate.findForUserAndYear(spouseId, year),
        this.commute.findForUserAndYear(spouseId, year),
        this.interview.findAllForUserAndYear(spouseId, year),
      ])
      spouseChRecord = spouseCh
      const spouseAnswers: Record<string, string> = {}
      for (const row of spouseInterview) spouseAnswers[row.questionId] = row.value
      personBFacts = {
        firstName: spouseProf?.firstName ?? null,
        lastName: spouseProf?.lastName ?? null,
        steuerId: spouseProf?.steuerId ?? null,
        geburtsdatum: spouseSd?.geburtsdatum ?? null,
        religion: spouseSd?.religion ?? null,
        beruf: spouseSd?.beruf ?? null,
        bruttoarbeitslohn: spouseLstb?.bruttoarbeitslohn ?? null,
        pension: spousePension ? { rentenart: spousePension.rentenart, jahresbetrag: spousePension.jahresbetrag } : null,
        chSalaryCertificate: chSalaryCertificateFacts(spouseCh, spouseAnswers),
        commute: commuteFacts(year, spouseCommute),
        healthInsurance: healthInsurances(spouseAnswers, spouseCh),
      }
    }

    const rentalFacts = properties.map((obj, i) => ({
      sequenceNumber: String(i + 1),
      strasse: [obj.strasse, obj.hausnummer].filter(Boolean).join(' ') || null,
      plz: obj.plz ?? null,
      city: obj.city ?? null,
      livingArea: obj.livingArea ?? null,
      mieteinnahmen: obj.mieteinnahmen,
      anschaffungskosten: obj.anschaffungskosten,
      baujahr: obj.baujahr,
      werbungskosten: obj.werbungskosten,
      depreciationAsLastYear: obj.depreciationAsLastYear ?? null,
      umlagen: obj.umlagen ?? null,
      schuldzinsen: obj.schuldzinsen ?? null,
      einheiten: obj.einheiten ?? null,
      anteilA: obj.anteilA ?? null,
    }))

    const childrenFacts = kinder.map((k, i) => {
      let swissFamilyAllowanceEur = k.swissFamilyAllowanceEur
      if (!swissFamilyAllowanceEur && kinder.length > 0) {
        const allowancesChf = ch?.nGre.familienzulagenChf ?? spouseChRecord?.nGre.familienzulagenChf
        const rate = ch?.exchangeRateValue ?? spouseChRecord?.exchangeRateValue
        if (allowancesChf && Number(allowancesChf) > 0 && rate && rate > 0) {
          const perChildChf = Math.round(Number(allowancesChf) / kinder.length)
          swissFamilyAllowanceEur = String(Math.round(perChildChf * rate))
        }
      }
      return {
        sequenceNumber: String(i + 1),
        firstName: k.firstName,
        lastName: k.lastName,
        geburtsdatum: k.geburtsdatum,
        taxId: k.taxId,
        childBenefitClaimEur: k.childBenefitClaimEur,
        swissFamilyAllowanceEur,
        kinship: k.kinship,
        kinshipB: k.kinshipB,
        familyBenefitsOffice: k.familyBenefitsOffice,
        domesticResidenceAllYear: k.domesticResidenceAllYear,
        otherParent: k.otherParent,
        otherParentName: k.otherParentName,
        otherParentBirthDate: k.otherParentBirthDate,
        otherParentAddress: k.otherParentAddress,
        otherParentKind: k.otherParentKind,
        otherParentDiedOn: k.otherParentDiedOn,
        registeredWithMeAllYear: k.registeredWithMeAllYear,
        childBenefitToMeAllYear: k.childBenefitToMeAllYear,
        healthBasicEur: k.healthBasicEur,
        childcareEur: k.childcareEur ?? null,
        childcareProvider: k.childcareProvider ?? null,
        childcareFrom: k.childcareFrom ?? null,
        childcareTo: k.childcareTo ?? null,
        careEur: k.careEur,
      }
    })

    const donationsAmount = amountFromAnswer(answers['spenden-betrag'])

    return printoutValues({
      taxYear: year,
      profile: {
        firstName: profile?.firstName ?? null,
        lastName: profile?.lastName ?? null,
        steuerId: profile?.steuerId ?? null,
        steuernummer: profile?.steuernummer ?? null,
      },
      masterData,
      bruttoarbeitslohn: lstb?.bruttoarbeitslohn ?? null,
      pension: pension ? { rentenart: pension.rentenart, jahresbetrag: pension.jahresbetrag } : null,
      capital: capital
        ? {
            depot: classifyCapitalDepot(answers['kap-depot']).kind,
            kapitalertraege: capital.kapitalertraege,
            sparerPauschbetrag: capital.sparerPauschbetrag,
            kapitalertragsteuer: capital.kapitalertragsteuer,
            solidaritaetszuschlag: capital.solidaritaetszuschlag,
            kirchensteuer: capital.kirchensteuer,
            inhaber: capital.inhaber ?? null,
          }
        : null,
      chSalaryCertificate: chSalaryCertificateFacts(ch, answers),
      rental: rentalFacts.length > 0 ? rentalFacts : null,
      kinder: childrenFacts.length > 0 ? childrenFacts : null,
      link: link ? { filingType: link.filingType, personB: personBFacts } : null,
      specialExpenses: donationsAmount !== null ? { donations: String(donationsAmount) } : null,
      healthInsurance: healthInsurances(answers, ch),
      singleParent: {
        otherPerson: answers['ae-weitere-person'] ?? null,
        householdCommunity: answers['ae-haushaltsgemeinschaft'] ?? null,
      },
      householdAndHealth: HOUSEHOLD_AND_HEALTH_BOOSTERS
        ? {
            healthCostsEur: answers['gesundheit-gate'] === 'Ja' ? amountOf(answers['gesundheit-betrag']) : null,
            minijobEur: answers['haushalt-gate'] === 'Ja' ? amountOf(answers['haushalt-minijob-betrag']) : null,
            servicesEur: answers['haushalt-gate'] === 'Ja' ? amountOf(answers['haushalt-dienstleistung-betrag']) : null,
            craftsmenLabourEur: answers['haushalt-gate'] === 'Ja' ? amountOf(answers['haushalt-handwerker-betrag']) : null,
            craftsmenInvoicesEur: answers['haushalt-gate'] === 'Ja' ? amountOf(answers['haushalt-handwerker-rechnungsbetrag']) : null,
          }
        : null,
      riester:
        answers['riester'] === 'Ja'
          ? { kind: answers['riester-art'] ?? null, incomeLastYear: answers['riester-einnahmen-vorjahr'] ?? null }
          : null,
      commute: commuteFacts(year, commute),
    })
  }
}

function chSalaryCertificateFacts(ch: CrossBorderSalaryStatementRecord | null, answers: Record<string, string>): ChSalaryCertificateFacts | null {
  if (!ch) return null
  return {
    status: crossBorderStatusFrom(answers),
    rate: ch.exchangeRateValue,
    grossWageChf: ch.fields['bruttolohn-total'],
    ahvContributionsChf: ch.fields['ahv-beitraege'],
    withholdingTaxChf: ch.fields['quellensteuer'],
    arbeitgeberName: ch.nGre.arbeitgeberName,
    arbeitgeberStrasse: ch.nGre.arbeitgeberStrasse,
    arbeitgeberPlzOrt: ch.nGre.arbeitgeberPlzOrt,
    familienzulagenChf: ch.nGre.familienzulagenChf,
    krankentaggeldChf: ch.nGre.krankentaggeldChf,
    pkArbeitnehmerChf: ch.nGre.pkArbeitnehmerChf,
    pkArbeitgeberChf: ch.nGre.pkArbeitgeberChf,
    pkArbeitnehmerGesamtChf: ch.fields['berufliche-vorsorge'],
    pkArbeitgeberGesamtChf: ch.nGre.pkArbeitgeberGesamtChf,
    steuerfreiesKrankentaggeldChf: ch.nGre.steuerfreiesKrankentaggeldChf,
    krankentaggeldArbeitgeberProzent: ch.nGre.krankentaggeldArbeitgeberProzent,
    krankentaggeldArbeitgeberChf: ch.nGre.krankentaggeldArbeitgeberChf,
    nbuvArbeitgeberProzent: ch.nGre.nbuvArbeitgeberProzent,
    nbuvArbeitgeberChf: ch.nGre.nbuvArbeitgeberChf,
    specialCases: ch.nGre.nGreSonderfaelle,
  }
}

function commuteFacts(year: number, inputs: CommuteInputs | null): CommuteFacts | null {
  if (inputs === null) return null
  const workExpenses = {
    professionalBodiesEur: inputs.professionalBodiesEur ?? null,
    professionalBodiesNote: inputs.professionalBodiesNote ?? null,
    workEquipmentEur: inputs.workEquipmentEur ?? null,
    workEquipmentNote: inputs.workEquipmentNote ?? null,
    accountFeesEur: inputs.accountFeesEur ?? null,
    otherWorkExpensesEur: inputs.otherWorkExpensesEur ?? null,
    otherWorkExpensesNote: inputs.otherWorkExpensesNote ?? null,
  }
  const result = calculateWorkdays({
    year,
    workdays: inputs.workdays,
    vacationDays: inputs.vacationDays,
    sickDays: inputs.sickDays,
    homeOfficeDays: inputs.homeOfficeDays,
    publicHolidays: effectivePublicHolidays(year, inputs),
  })
  if (result.kind !== 'bestimmt') return null
  return {
    workdaysPerWeek: inputs.workdays.length,
    daysOff: inputs.vacationDays + inputs.sickDays + inputs.homeOfficeDays,
    commuteDays: result.commuteDays,
    oneWayKm: inputs.oneWayKm,
    withCar: inputs.transport === 'pkw',
    workplace: inputs.workplace,
    workExpenses,
  }
}

/**
 * Self-paid insurance for the Anlage Vorsorgeaufwand: what the Sonderausgaben interview names, plus a Swiss
 * Krankenkasse from the Grenzgänger mask (foreign, Basisabsicherung, no Krankengeld) converted at the Lohnausweis rate.
 */
function healthInsurances(
  answers: Record<string, string>,
  ch: { krankenkasseChf: string | null; exchangeRateValue: number | null } | null,
): HealthInsurance[] {
  const list: HealthInsurance[] = []
  const fromInterview = healthInsuranceFromAnswers(answers)
  if (fromInterview) list.push(fromInterview)
  const chf = ch?.krankenkasseChf ? Number(ch.krankenkasseChf) : 0
  if (chf > 0 && ch?.exchangeRateValue) {
    list.push({ kind: 'ausland', basicHealthAmount: Math.round(chf * ch.exchangeRateValue), withSickPay: false, careInsuranceAmount: 0, optionalExtrasAmount: 0 })
  }
  return list
}

/** A whole-euro interview amount; „später“ and anything else is not printed. */
function amountOf(answer: string | undefined): number | null {
  return answer !== undefined && /^\d+$/.test(answer) && Number(answer) > 0 ? Number(answer) : null
}
