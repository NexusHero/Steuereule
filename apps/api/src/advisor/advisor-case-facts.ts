import {
  PROFESSION_VALUES,
  amountFromAnswer,
  homeOfficeDaysFromInterview,
  buildRecordHandles,
  type AdvisorRecordHandles,
  type CaseDigest,
  type Profession,
  ageAtEndOfYear,
  filingDeadlineFor,
  isSupportedIncomeTaxYear,
  voluntaryFilingDeadlineFor,
  type CaseFurtherFacts,
} from '@steuereule/core'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { type CapitalRepository } from '../capital/capital.repository.js'
import { type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { type ChildRepository } from '../children/child.repository.js'
import { type CommuteRepository } from '../commute/commute.repository.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { type ProfileRepository } from '../profile/profile.repository.js'
import { type PensionRecord, type PensionRepository } from '../pension/pension.repository.js'
import { type RentalRepository } from '../rental/rental.repository.js'
import { parseNum } from './advisor-shared.js'

/** What the owl is told about the case: the figures of the return without anything personal, and the neutral names of its records. */
export class AdvisorCaseFacts {
  constructor(
    private readonly capitalRepo: CapitalRepository | undefined,
    private readonly chRepo: CrossBorderSalaryStatementRepository | undefined,
    private readonly childRepo: ChildRepository | undefined,
    private readonly commuteRepo: CommuteRepository | undefined,
    private readonly confirmationService: ConfirmationService,
    private readonly interviewRepo: InterviewAnswerRepository,
    private readonly lstbRepo: WageTaxCertificateRepository | undefined,
    private readonly owlModeService: OwlModeService,
    private readonly profileRepo: ProfileRepository | undefined,
    private readonly rentalRepo: RentalRepository | undefined,
    private readonly pensionRepo?: PensionRepository | undefined,
  ) {}

  /** Names of the user and their children, so free text can be scrubbed before it reaches any model. */
  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    const names: string[] = []
    if (this.profileRepo) {
      const profile = await this.profileRepo.findByUserId(userId)
      if (profile?.firstName) names.push(profile.firstName)
      if (profile?.lastName) names.push(profile.lastName)
    }
    if (this.childRepo) {
      const children = await this.childRepo.listForUserAndYear(userId, taxYear)
      for (const child of children) {
        if (child.firstName) names.push(child.firstName)
        if (child.lastName) names.push(child.lastName)
      }
    }
    return names
  }

  /**
   * The stored rental objects and children under the neutral names the owl uses for them. Only the
   * names go to the model; the ids stay here and are filled into a draft when it is staged.
   */
  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    const [children, rentals] = await Promise.all([
      this.childRepo ? this.childRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.rentalRepo ? this.rentalRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
    ])
    return {
      vermietung: buildRecordHandles('vermietung', rentals.map((rental) => rental.id)),
      kind: buildRecordHandles('kind', children.map((child) => child.id)),
    }
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    const [
      currentYearAnswers,
      lastYearAnswers,
      lstbRecord,
      chRecord,
      commuteRecord,
      children,
      rentals,
      capitalRecord,
      owlCardsResponse,
      missingConfirmationsList,
      pensionRecord,
    ] = await Promise.all([
      this.interviewRepo.findAllForUserAndYear(userId, taxYear),
      this.interviewRepo.findAllForUserAndYear(userId, taxYear - 1),
      this.lstbRepo ? this.lstbRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.chRepo ? this.chRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.commuteRepo ? this.commuteRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.childRepo ? this.childRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.rentalRepo ? this.rentalRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.capitalRepo ? this.capitalRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.owlModeService.getCards(userId, taxYear),
      this.confirmationService.missing(userId, taxYear),
      this.pensionRepo ? this.pensionRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
    ])

    const answerMap: Record<string, string> = {}
    for (const row of currentYearAnswers) {
      answerMap[row.questionId] = row.value
    }

    const lastYearMap: Record<string, string> = {}
    for (const row of lastYearAnswers) {
      lastYearMap[row.questionId] = row.value
    }

    const rawProfession = answerMap['beruf']
    const profession = (PROFESSION_VALUES as readonly string[]).includes(rawProfession ?? '')
      ? (rawProfession as Profession)
      : undefined

    const homeOfficeDays =
      commuteRecord && commuteRecord.homeOfficeDays > 0
        ? commuteRecord.homeOfficeDays
        : homeOfficeDaysFromInterview(answerMap)

    const digest: CaseDigest = {
      taxYear,
      filingStatus: answerMap['partner'] === 'Ja' ? 'zusammen' : 'einzel',
      profession,
      lstbPersonA: {
        grossWageEur: parseNum(lstbRecord?.bruttoarbeitslohn),
        wageTaxEur: parseNum(lstbRecord?.lohnsteuer),
        socialSecurityEur: parseNum(lstbRecord?.sozialversicherung),
      },
      crossBorder: {
        isCrossBorderCh: answerMap['ausland'] === 'Ja, in die Schweiz',
        grossWageChf: parseNum(chRecord?.fields['bruttolohn-total']),
        withholdingTaxChf: parseNum(chRecord?.fields['quellensteuer']),
        pillar3aChf: parseNum(chRecord?.saeule3aChf),
        healthInsuranceChf: parseNum(chRecord?.krankenkasseChf),
        dailySicknessBenefitChf: parseNum(chRecord?.nGre?.krankentaggeldChf),
        nonReturnDays: parseNum(answerMap['ch-nichtrueckkehrtage']),
      },
      commuteAndWorkdays: {
        workdays: parseNum(answerMap['tage']) ?? 220,
        homeOfficeAnswer: answerMap['homeoffice'] ?? null,
        homeOfficeDays,
        distanceKm: commuteRecord?.oneWayKm ?? parseNum(answerMap['weg']),
      },
      catalogExpenses: {
        hasTraining: answerMap['fortbildung'] === 'Ja' || answerMap['katalog_fortbildung'] === 'ja',
        trainingCostsEur: answerMap['fortbildung'] === 'Ja' ? amountFromAnswer(answerMap['fortbildung-kosten']) : null,
        relocationCostsEur: answerMap['umzug'] === 'Ja' ? amountFromAnswer(answerMap['umzug-kosten']) : null,
        donationsEur:
          answerMap['spenden'] === 'Ja'
            ? amountFromAnswer(answerMap['spenden-betrag'])
            : amountFromAnswer(answerMap['katalog_spenden']),
        selfPaidKvPvEur: answerMap['kv-pv'] === 'Ja' ? amountFromAnswer(answerMap['kv-pv-betrag']) : null,
        riesterEur: answerMap['riester'] === 'Ja' ? amountFromAnswer(answerMap['riester-betrag']) : null,
        doubleHouseholdRentEur: answerMap['dhf'] === 'Ja' ? amountFromAnswer(answerMap['dhf-miete']) : null,
      },
      childrenCount: children.length,
      childrenAges: children.map((child) => ageAtEndOfYear(child.geburtsdatum, taxYear)).filter((age): age is number => age !== null),
      rentalObjectsCount: rentals.length,
      capitalGainEur: parseNum(capitalRecord?.kapitalertraege),
      priorYearComparison: {
        donationsEur: amountFromAnswer(lastYearMap['spenden-betrag']) ?? amountFromAnswer(lastYearMap['katalog_spenden']),
      },
      openOwlHints: owlCardsResponse.cards.map((c) => ({
        id: c.id,
        fingerprint: c.fingerprint,
        title: c.title,
        message: c.message,
        sourceId: 'estg-9-1',
        amountEur: c.amountEur,
      })),
      printoutMissingFields: missingConfirmationsList,
      estimatedRefundEur: null,
      furtherFacts: furtherFactsOf(taxYear, answerMap, pensionRecord, rentals, capitalRecord),
    }

    // Security gate: verify CaseDigest is 100% free of Steuer-IDs, IBANs, and personal keys
    checkPiiFree(digest)

    return digest
  }
}

type Rental = Awaited<ReturnType<RentalRepository['listForUserAndYear']>>[number]
type CapitalRecord = Awaited<ReturnType<CapitalRepository['findForUserAndYear']>>

/** Sum of the entered figures; null while none of them is entered. */
function sumEntered(values: readonly (number | null)[]): number | null {
  const entered = values.filter((value): value is number => value !== null)
  return entered.length === 0 ? null : entered.reduce((sum, value) => sum + value, 0)
}

/** A yes answer with its amount; null when the answer is not yes or the amount is not entered. */
const amountIfYes = (answers: Readonly<Record<string, string>>, gate: string, amount: string): number | null =>
  answers[gate] === 'Ja' ? amountFromAnswer(answers[amount]) : null

/** The rest of the case in figures (#501 follow-up): no name, no address, no identifier. */
export function furtherFactsOf(
  taxYear: number,
  answers: Readonly<Record<string, string>>,
  pension: PensionRecord | null,
  rentals: readonly Rental[],
  capital: CapitalRecord,
): CaseFurtherFacts {
  const supported = isSupportedIncomeTaxYear(taxYear)
  return {
    answeredQuestions: Object.keys(answers).length,
    filingStatusAnswered: answers['partner'] !== undefined || answers['familienstand'] !== undefined,
    singleParent: answers['alleinerziehend'] === 'Ja',
    pension: pension && (pension.rentenart !== null || pension.jahresbetrag !== null) ? { kind: pension.rentenart, annualEur: parseNum(pension.jahresbetrag) } : null,
    rentals: {
      rentEur: sumEntered(rentals.map((rental) => parseNum(rental.mieteinnahmen))),
      expensesEur: sumEntered(rentals.map((rental) => parseNum(rental.werbungskosten))),
      loanInterestEur: sumEntered(rentals.map((rental) => parseNum(rental.schuldzinsen))),
    },
    capital: {
      withheldTaxEur: parseNum(capital?.kapitalertragsteuer),
      saverAllowanceUsedEur: parseNum(capital?.sparerPauschbetrag),
      depot: answers['kap-depot'] ?? null,
    },
    sideJobGrossEur: amountIfYes(answers, 'nebenjob', 'nebenjob-brutto'),
    wageReplacementEur: amountIfYes(answers, 'lohnersatz', 'lohnersatz-betrag'),
    severanceEur: amountIfYes(answers, 'abfindung', 'abfindung-betrag'),
    healthCostsEur: amountFromAnswer(answers['gesundheit-betrag']),
    householdServicesEur: sumEntered(['haushalt-dienstleistung-betrag', 'haushalt-handwerker-betrag', 'haushalt-minijob-betrag'].map((id) => amountFromAnswer(answers[id]))),
    filingDeadline: supported ? filingDeadlineFor(taxYear) : null,
    voluntaryFilingDeadline: supported ? voluntaryFilingDeadlineFor(taxYear) : null,
  }
}
