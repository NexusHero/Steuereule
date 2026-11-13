import type { OwlSourceId } from './owl-mode'

/**
 * When the summaries below were last read against the wording on gesetze-im-internet.de. The
 * nightly law watch (apps/api/scripts/check-law-changes.ts) notices when one of these norms changes.
 */
export const LEGAL_SOURCES_CHECKED_ON = '13.11.2026'
import type { AdvisorAnswerNotice } from './advisor-answer-check'
import type { AdvisorNoteChange } from './advisor-notes'
import type { AdvisorQuestionRound, InterviewAreaChange } from './advisor-skills'
import type { AdvisorModelFailure } from './advisor-failure'
import type { AdvisorThoughtStep } from './advisor-thought'
import { topicRefusal, type AdvisorTopicOutcome } from './advisor-topic'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import type { Marking, Screen } from './marking'
import type { Profession } from './interview'
import type { LstbCalculationTerm, LstbExtractedFieldStatus, LstbFieldReason } from '../domains/lstb-parser'
import { taxEstimateCrossBorder, taxEstimateEmployee } from '../engine/tax-estimate'

export type AdvisorActionStatus = 'pending' | 'applied' | 'dismissed' | 'superseded' | 'undone'

export interface AdvisorLegalSource {
  readonly sourceId: OwlSourceId
  readonly paragraph: string
  readonly title: string
  readonly summary: string
  readonly legalStatusDate: string
  readonly url: string
}

export const ADVISOR_LEGAL_SOURCES: Readonly<Record<OwlSourceId, AdvisorLegalSource>> = {
  'estg-4-5-6c': {
    sourceId: 'estg-4-5-6c',
    paragraph: '§ 4 Abs. 5 Nr. 6c EStG',
    title: 'Homeoffice-Tagespauschale & Arbeitszimmer',
    summary:
      'Für jeden Kalendertag, an dem du überwiegend zu Hause arbeitest und keine erste Tätigkeitsstätte aufsuchst, sind 6 € pro Tag (maximal 1.260 € für bis zu 210 Tage im Jahr) als Werbungskosten abziehbar.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__4.html',
  },
  'estg-9-1': {
    sourceId: 'estg-9-1',
    paragraph: '§ 9 Abs. 1 EStG',
    title: 'Werbungskosten & Entfernungspauschale',
    summary:
      'Werbungskosten sind Aufwendungen zur Erwerbung, Sicherung und Erhaltung der Einnahmen. Sie wirken sich steuermindernd aus, sobald sie zusammen den Arbeitnehmer-Pauschbetrag von 1.230 € überschreiten.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-4a': {
    sourceId: 'estg-9-1-4a',
    paragraph: '§ 9 Abs. 1 Nr. 4a EStG',
    title: 'Reise- und Fahrtkosten bei Auswärtstätigkeit',
    summary:
      'Fahrten zu einer Fortbildungsstätte oder auf Dienstreise sind keine Fahrten zur ersten Tätigkeitsstätte: Du kannst jeden gefahrenen Kilometer (Hin- und Rückfahrt) mit dem Satz des Bundesreisekostengesetzes (Pkw 0,30 €) oder die tatsächlichen Ticketkosten ansetzen.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-6': {
    sourceId: 'estg-9-1-6',
    paragraph: '§ 9 Abs. 1 Nr. 6 EStG',
    title: 'Arbeitsmittel & Computerhardware',
    summary:
      'Beruflich genutzte Arbeitsmittel bis 800 € netto (952 € brutto) sowie Computerhardware und Software (BMF-Schreiben vom 22.02.2022) können im Jahr der Anschaffung in Höhe des beruflichen Nutzungsanteils sofort abgezogen werden.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-4a': {
    sourceId: 'estg-9-4a',
    paragraph: '§ 9 Abs. 4a EStG',
    title: 'Verpflegungsmehraufwendungen',
    summary:
      'Bei beruflicher Auswärtstätigkeit oder Fortbildung außerhalb deiner Wohnung und ersten Tätigkeitsstätte gelten Pauschalen: 14 € ab mehr als 8 Stunden Abwesenheit (sowie für An- und Abreisetage bei Übernachtung) und 28 € für volle 24-Stunden-Tage.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-6': {
    sourceId: 'estg-9-6',
    paragraph: '§ 9 Abs. 6 EStG',
    title: 'Erst- und Zweitausbildung',
    summary:
      'Aufwendungen für eine Berufsausbildung oder ein Studium nach einer bereits abgeschlossenen ersten Ausbildung (Zweitausbildung, z. B. Master nach Bachelor) sind unbeschränkt als Werbungskosten abziehbar.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-10b': {
    sourceId: 'estg-10b',
    paragraph: '§ 10b EStG',
    title: 'Steuerbegünstigte Zuwendungen (Spenden)',
    summary:
      'Spenden und Mitgliedsbeiträge zur Förderung steuerbegünstigter Zwecke sind bis zu 20 % des Gesamtbetrags der Einkünfte direkt als Sonderausgaben abziehbar (bis 300 € je Einzelspende genügt der Kontoauszug als vereinfachter Nachweis).',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__10b.html',
  },
  'estg-10-1-5': {
    sourceId: 'estg-10-1-5',
    paragraph: '§ 10 Abs. 1 Nr. 5 EStG',
    title: 'Kinderbetreuungskosten',
    summary:
      'Kinderbetreuungskosten für Kinder bis zum 14. Lebensjahr (Kita, Tagesmutter, Hort) sind zu 80 %, höchstens 4.800 € je Kind, als Sonderausgaben abziehbar (bis 2024: zwei Drittel, höchstens 4.000 €), sofern eine Rechnung vorliegt und unbar gezahlt wurde.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/estg/__10.html',
  },
  'ao-355': {
    sourceId: 'ao-355',
    paragraph: '§ 355 Abs. 1 AO',
    title: 'Einspruchsfrist gegen Steuerbescheide',
    summary:
      'Ein Einspruch gegen den Einkommensteuerbescheid ist innerhalb eines Monats nach Bekanntgabe des Bescheids beim Finanzamt einzulegen.',
    legalStatusDate: LEGAL_SOURCES_CHECKED_ON,
    url: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
  },
}

export type AdvisorEffectKind = 'computed' | 'not-computable'

export interface AdvisorActionProposal {
  readonly actionId: string
  readonly status: AdvisorActionStatus
  readonly screen: Screen
  readonly field: string
  readonly instance: string | null
  readonly companionFields?: Readonly<Record<string, string>> | undefined
  /** Raw values of the companion fields when the draft was created; the stale check compares against them. */
  readonly companionExpectedValues?: Readonly<Record<string, string | null>> | undefined
  /** Server-internal: exact pre-apply state of every written field, so undo restores value and provenance. */
  readonly undoSnapshot?: readonly AdvisorUndoEntry[] | undefined
  /** ISO timestamps of the last apply / undo — the per-field trail of AI-applied changes. */
  readonly appliedAt?: string | undefined
  readonly undoneAt?: string | undefined
  readonly label: string
  readonly previousValue: string | null
  readonly expectedPreviousValue?: string | null | undefined
  readonly newValue: string
  readonly beforeRefundEur: number
  readonly afterRefundEur: number
  readonly deltaEur: number
  /**
   * Where the euro figures come from. `computed`: the app's own estimate, once for the stored
   * return and once with this draft applied. `not-computable`: the estimate cannot say (the hint
   * tells the user why), and the three figures above are 0. Absent: the rough approximation of
   * the path without a database (ADR-0066).
   */
  readonly effect?: AdvisorEffectKind | undefined
  readonly effectHint?: string | undefined
  readonly reason: string
  readonly sourceId: OwlSourceId
  readonly paragraph?: string | undefined
  /** Optional receipt reference when a proposal originates from a scanned receipt (#444). */
  readonly receiptId?: string | undefined
  readonly confidenceStatus?: LstbExtractedFieldStatus | undefined
  readonly sourceLines?: readonly string[] | undefined
  readonly calculation?: readonly LstbCalculationTerm[] | undefined
  readonly fieldReason?: LstbFieldReason | null | undefined
}

export interface AdvisorUndoEntry {
  readonly key: string
  readonly previousValue: string | null
  readonly appliedValue: string | null
  readonly previousMarking: Omit<Marking, 'key' | 'value'> | null
}

export interface AdvisorEngineInfo {
  readonly mode: 'langgraph' | 'deterministic_fallback'
  readonly provider?: string | undefined
  readonly model?: string | undefined
  /** What the topic guard said about the question (ADR-0069): verdict and category, never the text. */
  readonly topic?: AdvisorTopicOutcome | undefined
}

export interface AdvisorTwoPathsProposal {
  readonly title: string
  readonly safePath: AdvisorActionProposal
  readonly maxPath: AdvisorActionProposal & { readonly evidenceHint: string }
  readonly sourceId: OwlSourceId
}

export interface AdvisorLstbScanMeta {
  readonly receiptId: string | null
  readonly stage: 'deterministic' | 'llm_text_fallback'
  readonly taxYearOnDocument: number | null
  readonly person?: 'A' | 'B' | undefined
  readonly actionIds: readonly string[]
}

export interface AdvisorMessageMeta {
  readonly choices?: readonly string[] | undefined
  readonly action?: AdvisorActionProposal | undefined
  readonly actions?: readonly AdvisorActionProposal[] | undefined
  readonly lstbScan?: AdvisorLstbScanMeta | undefined
  readonly twoPaths?: AdvisorTwoPathsProposal | undefined
  readonly sources?: readonly OwlSourceId[] | undefined
  /** What the check of the finished answer found; shown by the app under the answer (ADR-0066 §7). */
  readonly notices?: readonly AdvisorAnswerNotice[] | undefined
  /** What the owl changed in the project notes in this answer; each change can be undone (#481). */
  readonly noteChanges?: readonly AdvisorNoteChange[] | undefined
  /** Additions to the user's own description of the situation the owl suggests; taken over with a tap (#501). */
  readonly situationSuggestions?: readonly string[] | undefined
  /** A round of questions with answers to tap, from the interview skill (#495). */
  readonly questionRound?: AdvisorQuestionRound | undefined
  /** Areas of the interview the owl marked as settled or reopened in this answer; stored, then dropped from the message. */
  readonly interviewChanges?: readonly InterviewAreaChange[] | undefined
  /** Turbo mode: the owl applied the drafts of this answer itself, without a click; each can be undone. */
  readonly turbo?: true | undefined
  /** Why the model did not answer this turn, when it did not (#487). */
  readonly modelFailure?: AdvisorModelFailure | undefined
  /** Server-internal: which engine produced the turn, kept with the drafts it proposed. */
  readonly engine?: AdvisorEngineInfo | undefined
  /** Server-internal: the turn was regenerated or edited away (#451 slice 1b); hidden from the chat. */
  readonly replaced?: true | undefined
  /**
   * Set on both messages of an opening (ADR-0067 §11): the user's placeholder is hidden in the chat,
   * the answer is the owl's opening. The fingerprint tells whether the case changed since.
   */
  readonly opening?: { readonly fingerprint: string; readonly stage: 'partial' | 'ready' } | undefined
  /** The steps the owl reported while working (status and tool labels), kept with the answer (#476). */
  readonly steps?: readonly string[] | undefined
  /** The same steps with their kind and, for tools, what each found; replaces `steps` on new answers. */
  readonly thoughtSteps?: readonly AdvisorThoughtStep[] | undefined
  /**
   * What the owl tried to prepare in this answer and could not (ADR-0066). Shown under the answer,
   * so the text can never claim a draft that does not exist without the user seeing it.
   */
  readonly notStaged?: readonly AdvisorNotStaged[] | undefined
}

export interface AdvisorNotStaged {
  readonly label: string
  /** Why, in the user's language. */
  readonly reason: string
  /** The mask where the user can do it by hand; the chat offers to open it. */
  readonly screen?: Screen | undefined
}

/**
 * Lifecycle of a chat message (#476). An assistant message exists from the moment its turn starts:
 * `streaming` while the run is alive, then exactly one of the three final states.
 */
export const ADVISOR_MESSAGE_STATUSES = ['streaming', 'complete', 'aborted', 'failed'] as const
export type AdvisorMessageStatus = (typeof ADVISOR_MESSAGE_STATUSES)[number]

export const ADVISOR_FEEDBACK_RATINGS = ['up', 'down'] as const
export type AdvisorFeedbackRating = (typeof ADVISOR_FEEDBACK_RATINGS)[number]

/** Why an answer got a thumbs down; a fixed list so no free text leaves the encrypted history. */
export const ADVISOR_FEEDBACK_REASONS = ['falsch', 'unklar', 'nicht_hilfreich'] as const
export type AdvisorFeedbackReason = (typeof ADVISOR_FEEDBACK_REASONS)[number]

export interface AdvisorMessageFeedback {
  readonly rating: AdvisorFeedbackRating
  readonly reason?: AdvisorFeedbackReason | undefined
}

export interface AdvisorChatMessageView {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly createdAt: string
  /** Absent on rows written before #476; read as `complete`. */
  readonly status?: AdvisorMessageStatus | undefined
  /** The provider's reasoning summary for this answer, if the model supplied one. */
  readonly reasoning?: string | undefined
  readonly feedback?: AdvisorMessageFeedback | null | undefined
  /** Set while `status` is `streaming`: the run a client can re-attach to. */
  readonly runId?: string | undefined
  /** How long the owl worked on a finished answer, in milliseconds. */
  readonly durationMs?: number | undefined
}

export interface CaseDigest {
  readonly taxYear: number
  readonly filingStatus: 'einzel' | 'zusammen'
  readonly profession?: Profession | undefined
  readonly lstbPersonA: {
    readonly grossWageEur: number | null
    readonly wageTaxEur: number | null
    readonly socialSecurityEur: number | null
  }
  readonly crossBorder: {
    readonly isCrossBorderCh: boolean
    readonly grossWageChf: number | null
    readonly withholdingTaxChf: number | null
    readonly pillar3aChf: number | null
    readonly healthInsuranceChf: number | null
    readonly dailySicknessBenefitChf: number | null
    readonly nonReturnDays: number | null
  }
  readonly commuteAndWorkdays: {
    readonly workdays: number | null
    readonly homeOfficeAnswer: string | null
    readonly homeOfficeDays: number | null
    readonly distanceKm: number | null
  }
  readonly catalogExpenses: {
    readonly hasTraining: boolean
    /** What the training cost, once the user has said so; null while only „Ja“ is known (#476). */
    readonly trainingCostsEur?: number | null | undefined
    readonly relocationCostsEur: number | null
    readonly donationsEur: number | null
    readonly selfPaidKvPvEur: number | null
    readonly riesterEur: number | null
    readonly doubleHouseholdRentEur: number | null
  }
  readonly childrenCount: number
  /** Ages of the children at the end of the tax year, as far as a birth date is known (#501). */
  readonly childrenAges?: readonly number[] | undefined
  readonly rentalObjectsCount: number
  readonly capitalGainEur: number | null
  readonly priorYearComparison: {
    readonly donationsEur: number | null
  }
  readonly openOwlHints: readonly {
    readonly id: string
    readonly fingerprint: string
    readonly title: string
    readonly message: string
    readonly sourceId: OwlSourceId
    readonly amountEur: number | null
  }[]
  readonly printoutMissingFields: readonly string[]
  readonly estimatedRefundEur: number | null
  /** Everything else the interview and the masks know, in figures only (#501 follow-up). */
  readonly furtherFacts?: CaseFurtherFacts | undefined
}

/**
 * The rest of the case beyond wage, commute and the catalogue: pension, rental and capital
 * totals, other income, household costs and the deadlines. Amounts and counts only, never a
 * name, an address or an identifier; null means not entered.
 */
export interface CaseFurtherFacts {
  /** How many interview questions of this year have an answer: 0 means nothing was started. */
  readonly answeredQuestions: number
  /** Whether the user said how they are assessed (single or jointly), not just the default. */
  readonly filingStatusAnswered: boolean
  readonly singleParent: boolean
  readonly pension: { readonly kind: string | null; readonly annualEur: number | null } | null
  readonly rentals: { readonly rentEur: number | null; readonly expensesEur: number | null; readonly loanInterestEur: number | null }
  readonly capital: { readonly withheldTaxEur: number | null; readonly saverAllowanceUsedEur: number | null; readonly depot: string | null }
  readonly sideJobGrossEur: number | null
  readonly wageReplacementEur: number | null
  readonly severanceEur: number | null
  readonly healthCostsEur: number | null
  readonly householdServicesEur: number | null
  /** Leave as entered in the Arbeitstage mask; null without the mask, so the owl never calls them missing when they are not. */
  readonly leave?: { readonly vacationDays: number; readonly sickDays: number } | null | undefined
  /** The statutory and the voluntary filing deadline (ISO dates), where the year is supported. */
  readonly filingDeadline: string | null
  readonly voluntaryFilingDeadline: string | null
}

export function commuterAllowanceFrom(workdays: number, distanceKm: number, taxYear?: number): number {
  if (workdays <= 0 || distanceKm <= 0) return 0
  const commute =
    taxYear !== undefined && isSupportedIncomeTaxYear(taxYear)
      ? getTaxYearParameters(taxYear).commute
      : { firstKmThreshold: 20, rateFirstEur: 0.3, rateAdditionalEur: 0.38 }
  const first = Math.min(distanceKm, commute.firstKmThreshold) * commute.rateFirstEur
  const above = Math.max(0, distanceKm - commute.firstKmThreshold) * commute.rateAdditionalEur
  return Math.round(workdays * (first + above))
}

function homeOfficeDaysForAnswer(answer: string | null, workdays: number, taxYear?: number): number {
  const maxDays =
    taxYear !== undefined && isSupportedIncomeTaxYear(taxYear)
      ? getTaxYearParameters(taxYear).homeOffice.maxDays
      : 210
  if (answer === '1–2 Tage pro Woche') return Math.min(Math.round(workdays * 0.3), maxDays)
  if (answer === 'Fast immer') return Math.min(workdays, maxDays)
  return 0
}

/** Commute and home-office allowances from what the user entered: no assumed distance, no assumed days (ADR-0067 §11). */
export interface WorkAllowances {
  readonly commuteDays: number
  /** Entfernungspauschale for the days at the workplace; null while the distance is missing. */
  readonly commuteEur: number | null
  readonly homeOfficeDays: number
  /** Homeoffice-Tagespauschale, capped by the year's maximum; 0 without home-office days. */
  readonly homeOfficeEur: number
}

export function workAllowancesOf(digest: CaseDigest): WorkAllowances {
  const params = isSupportedIncomeTaxYear(digest.taxYear) ? getTaxYearParameters(digest.taxYear) : null
  const work = digest.commuteAndWorkdays
  const workdays = work.workdays ?? 220
  const homeOfficeDays = Math.min(work.homeOfficeDays ?? homeOfficeDaysForAnswer(work.homeOfficeAnswer, workdays, digest.taxYear), params?.homeOffice.maxDays ?? 210)
  const commuteDays = Math.max(0, workdays - homeOfficeDays)
  const rate = params?.homeOffice.dailyRateEur ?? 6
  return {
    commuteDays,
    commuteEur: work.distanceKm === null ? null : commuterAllowanceFrom(commuteDays, work.distanceKm, digest.taxYear),
    homeOfficeDays,
    homeOfficeEur: Math.min(homeOfficeDays * rate, params?.homeOffice.maxAnnualEur ?? homeOfficeDays * rate),
  }
}

function computeRefundMidpoint(digest: CaseDigest): number {
  const params = isSupportedIncomeTaxYear(digest.taxYear) ? getTaxYearParameters(digest.taxYear) : null
  const hoRate = params ? params.homeOffice.dailyRateEur : 6
  const hoMaxDays = params ? params.homeOffice.maxDays : 210

  if (digest.crossBorder.isCrossBorderCh && digest.crossBorder.grossWageChf) {
    const rate = 1.05
    const wageEur = Math.round(digest.crossBorder.grossWageChf * rate)
    const withholdingTaxEur = Math.round((digest.crossBorder.withholdingTaxChf ?? digest.crossBorder.grossWageChf * 0.045) * rate)
    const workdays = digest.commuteAndWorkdays.workdays ?? 220
    const distanceKm = digest.commuteAndWorkdays.distanceKm ?? 0
    const hoDays = digest.commuteAndWorkdays.homeOfficeDays ?? homeOfficeDaysForAnswer(digest.commuteAndWorkdays.homeOfficeAnswer, workdays, digest.taxYear)
    const commuteDays = Math.max(0, workdays - hoDays)
    const commuterAllowance = commuterAllowanceFrom(commuteDays, distanceKm, digest.taxYear) + hoDays * hoRate
    const est = taxEstimateCrossBorder({
      year: digest.taxYear,
      wageEur,
      withholdingTaxEur,
      retirementProvisionEur: Math.round(wageEur * 0.08),
      otherProvisionEur: Math.round((digest.crossBorder.dailySicknessBenefitChf ?? 0) * rate),
      healthInsuranceEur: Math.round((digest.crossBorder.healthInsuranceChf ?? 0) * rate),
      commuterAllowance,
      donations: digest.catalogExpenses.donationsEur ?? 0,
    })
    if (est.kind === 'spanne') {
      return Math.round((est.result.from + est.result.to) / 2)
    }
  }

  const gross = digest.lstbPersonA.grossWageEur && digest.lstbPersonA.grossWageEur > 0 ? digest.lstbPersonA.grossWageEur : 52000
  const lohnsteuer = digest.lstbPersonA.wageTaxEur && digest.lstbPersonA.wageTaxEur > 0 ? digest.lstbPersonA.wageTaxEur : 8400
  const sv = digest.lstbPersonA.socialSecurityEur && digest.lstbPersonA.socialSecurityEur > 0 ? digest.lstbPersonA.socialSecurityEur : 10200

  const workdays = digest.commuteAndWorkdays.workdays ?? 220
  const distanceKm = digest.commuteAndWorkdays.distanceKm ?? 15
  const hoDays = digest.commuteAndWorkdays.homeOfficeDays ?? homeOfficeDaysForAnswer(digest.commuteAndWorkdays.homeOfficeAnswer, workdays, digest.taxYear)
  const commuteDays = Math.max(0, workdays - hoDays)
  const commuterAllowance = commuterAllowanceFrom(commuteDays, distanceKm, digest.taxYear)
  const hoAllowance = Math.min(hoDays, hoMaxDays) * hoRate
  // Only what the user actually stated counts. A flat guess here once promised a refund the real
  // estimate never paid out (#476).
  const trainingAllowance = digest.catalogExpenses.hasTraining ? (digest.catalogExpenses.trainingCostsEur ?? 0) : 0
  const otherExpenses =
    hoAllowance +
    trainingAllowance +
    (digest.catalogExpenses.relocationCostsEur ?? 0) +
    (digest.catalogExpenses.doubleHouseholdRentEur ?? 0)

  const est = taxEstimateEmployee({
    year: digest.taxYear,
    bruttoarbeitslohn: gross,
    lohnsteuer,
    sozialversicherung: sv,
    commuterAllowance,
    otherIncomeRelatedExpenses: otherExpenses,
    donations: (digest.catalogExpenses.donationsEur ?? 0) + (digest.catalogExpenses.riesterEur ?? 0),
    selfPaidKvPv: digest.catalogExpenses.selfPaidKvPvEur ?? 0,
  })
  if (est.kind === 'spanne') {
    return Math.round((est.result.from + est.result.to) / 2)
  }
  return digest.estimatedRefundEur ?? 0
}

function readCurrentValueFromDigest(digest: CaseDigest, screen: Screen, field: string): string | null {
  if (screen === 'interview') {
    if (field === 'spenden-betrag') return digest.catalogExpenses.donationsEur !== null ? String(digest.catalogExpenses.donationsEur) : null
    if (field === 'spenden') return digest.catalogExpenses.donationsEur && digest.catalogExpenses.donationsEur > 0 ? 'Ja' : 'Nein'
    if (field === 'homeoffice') return digest.commuteAndWorkdays.homeOfficeAnswer
    if (field === 'weg') return digest.commuteAndWorkdays.distanceKm !== null ? String(digest.commuteAndWorkdays.distanceKm) : null
    if (field === 'tage') return digest.commuteAndWorkdays.workdays !== null ? String(digest.commuteAndWorkdays.workdays) : null
    if (field === 'fortbildung') return digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein'
    if (field === 'fortbildung-kosten') {
      const costs = digest.catalogExpenses.trainingCostsEur
      return costs !== null && costs !== undefined ? String(costs) : null
    }
    if (field === 'umzug-kosten') return digest.catalogExpenses.relocationCostsEur !== null ? String(digest.catalogExpenses.relocationCostsEur) : null
    if (field === 'dhf-miete') return digest.catalogExpenses.doubleHouseholdRentEur !== null ? String(digest.catalogExpenses.doubleHouseholdRentEur) : null
    if (field === 'riester-betrag') return digest.catalogExpenses.riesterEur !== null ? String(digest.catalogExpenses.riesterEur) : null
  }
  if (screen === 'lstb') {
    if (field === 'bruttoarbeitslohn') return digest.lstbPersonA.grossWageEur !== null ? String(digest.lstbPersonA.grossWageEur) : null
    if (field === 'lohnsteuer') return digest.lstbPersonA.wageTaxEur !== null ? String(digest.lstbPersonA.wageTaxEur) : null
    if (field === 'sozialversicherung') return digest.lstbPersonA.socialSecurityEur !== null ? String(digest.lstbPersonA.socialSecurityEur) : null
  }
  if (screen === 'commute') {
    if (field === 'oneWayKm') return digest.commuteAndWorkdays.distanceKm !== null ? String(digest.commuteAndWorkdays.distanceKm) : null
    if (field === 'homeOfficeDays') return digest.commuteAndWorkdays.homeOfficeDays !== null ? String(digest.commuteAndWorkdays.homeOfficeDays) : null
  }
  if (screen === 'chLohnausweis') {
    if (field === 'krankenkasseChf') return digest.crossBorder.healthInsuranceChf !== null ? String(digest.crossBorder.healthInsuranceChf) : null
    if (field === 'krankentaggeldChf') return digest.crossBorder.dailySicknessBenefitChf !== null ? String(digest.crossBorder.dailySicknessBenefitChf) : null
    if (field === 'saeule3aChf') return digest.crossBorder.pillar3aChf !== null ? String(digest.crossBorder.pillar3aChf) : null
  }
  return null
}

function applyCandidateToDigest(digest: CaseDigest, screen: Screen, field: string, newValue: string): CaseDigest {
  const num = Number.parseInt(newValue.replace(/[^\d-]/g, ''), 10)
  const parsedNum = Number.isFinite(num) ? num : 0

  if (screen === 'lstb') {
    if (field === 'bruttoarbeitslohn') {
      return { ...digest, lstbPersonA: { ...digest.lstbPersonA, grossWageEur: Math.max(0, parsedNum) } }
    }
    if (field === 'lohnsteuer') {
      return { ...digest, lstbPersonA: { ...digest.lstbPersonA, wageTaxEur: Math.max(0, parsedNum) } }
    }
    if (field === 'sozialversicherung') {
      return { ...digest, lstbPersonA: { ...digest.lstbPersonA, socialSecurityEur: Math.max(0, parsedNum) } }
    }
  }
  if (screen === 'commute') {
    if (field === 'oneWayKm') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, distanceKm: Math.max(0, parsedNum) },
      }
    }
    if (field === 'homeOfficeDays') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, homeOfficeDays: Math.max(0, parsedNum) },
      }
    }
  }
  if (screen === 'interview') {
    if (field === 'spenden-betrag') {
      return { ...digest, catalogExpenses: { ...digest.catalogExpenses, donationsEur: parsedNum } }
    }
    if (field === 'homeoffice') {
      const workdays = digest.commuteAndWorkdays.workdays ?? 220
      return {
        ...digest,
        commuteAndWorkdays: {
          ...digest.commuteAndWorkdays,
          homeOfficeAnswer: newValue,
          homeOfficeDays: homeOfficeDaysForAnswer(newValue, workdays, digest.taxYear),
        },
      }
    }
    if (field === 'weg') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, distanceKm: parsedNum },
      }
    }
    if (field === 'tage') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, workdays: parsedNum },
      }
    }
    if (field === 'fortbildung-kosten') {
      // An amount only makes sense with the question answered „Ja“; a draft carries both.
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, hasTraining: true, trainingCostsEur: parsedNum },
      }
    }
    if (field === 'fortbildung') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, hasTraining: newValue === 'Ja' },
      }
    }
    if (field === 'umzug-kosten') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, relocationCostsEur: parsedNum },
      }
    }
    if (field === 'dhf-miete') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, doubleHouseholdRentEur: parsedNum },
      }
    }
    if (field === 'riester-betrag') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, riesterEur: parsedNum },
      }
    }
  }
  if (screen === 'chLohnausweis') {
    if (field === 'krankenkasseChf') {
      return {
        ...digest,
        crossBorder: { ...digest.crossBorder, healthInsuranceChf: parsedNum },
      }
    }
    if (field === 'krankentaggeldChf') {
      return {
        ...digest,
        crossBorder: { ...digest.crossBorder, dailySicknessBenefitChf: parsedNum },
      }
    }
  }
  return digest
}

/**
 * Deterministic tax delta simulator ("Vorher/Nachher-Simulationsrechner").
 * Never guesses tax impacts: calculates exact before/after refund midpoint from @steuereule/core.
 */
export function simulateAdvisorFieldDelta(
  digest: CaseDigest,
  screen: Screen,
  field: string,
  newValue: string,
): {
  readonly previousValue: string | null
  readonly beforeRefundEur: number
  readonly afterRefundEur: number
  readonly deltaEur: number
} {
  const previousValue = readCurrentValueFromDigest(digest, screen, field)
  const beforeRefundEur = computeRefundMidpoint(digest)
  const updatedDigest = applyCandidateToDigest(digest, screen, field, newValue)
  const afterRefundEur = computeRefundMidpoint(updatedDigest)
  const deltaEur = afterRefundEur - beforeRefundEur
  return {
    previousValue,
    beforeRefundEur,
    afterRefundEur,
    deltaEur,
  }
}

function extractFirstEuroAmount(text: string): number | null {
  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:€|eur|euro|chf)/i) ?? text.match(/\b(\d{2,5})\b/)
  if (!match || !match[1]) return null
  const clean = match[1].replace(/[.\s]/g, '')
  const n = Number.parseInt(clean, 10)
  if (!Number.isFinite(n) || n <= 0 || n === 2024 || n === 2025 || n === 2026) return null
  return n
}

/**
 * The amount that belongs to a topic: the first one in the part of the sentence that names it.
 * "Brutto 46.800 €, 250 € gespendet" gives 250 for donations, not the wage. Null when that part has
 * no amount: then the fallback asks instead of drafting a number that was meant for something else.
 */
export function extractAmountNear(text: string, topic: RegExp): number | null {
  // A dot between digits is a thousands separator (1.800 €), not the end of a sentence.
  // "und" joins two statements as often as a comma does ("46.800 € verdient und 250 € gespendet").
  const parts = text.split(/(?<!\d)\.|\.(?!\d)|[;\n!?]|,(?!\d)|\s(?:und|sowie)\s/i)
  const part = parts.find((candidate) => topic.test(candidate))
  if (part === undefined) return null
  const match = part.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:€|eur|euro|chf)/i)
  if (!match || !match[1]) return null
  const n = Number.parseInt(match[1].replace(/[.\s]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractKilometers(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*(?:km|kilometer)/i)
  if (!match || !match[1]) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) && n > 0 && n <= 999 ? n : null
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(prior|previous)\s+instructions/i,
  /system[\s-]*prompt/i,
  /api[\s_-]*key/i,
  /sk-ant-|sk_live_|whsec_/i,
  /geheime\s+instruktionen/i,
  /vergiss\s+(alle\s+)?deine\s+(bisherigen\s+)?regeln/i,
  /developer\s+mode|jailbreak|\bDAN\b/i,
  /<script\b|javascript:|onerror\s*=/i,
  /drop\s+table|union\s+select/i,
  /__proto__|constructor\.prototype/i,
]

// Topics are no longer a boundary (#499, ADR-0069): the owl advises on the user's own tax matters
// with looked-up knowledge. What stays out is the promise of a binding legal opinion.
const STBERG_OUT_OF_SCOPE_PATTERNS = [/\b(verbindliche\s+rechtsauskunft|rechtsverbindliche\s+beratung)\b/i]

/**
 * The free first filter before any model runs. What is off topic is decided by the topic guard
 * (ADR-0069 §Themengrenze); these patterns stay only for obvious attacks, as the safety net for when
 * the guard is down and lets the turn through.
 */
export function checkAdvisorInputBoundary(message: string, digest: CaseDigest): {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
} | null {
  if (PROMPT_INJECTION_PATTERNS.some((rx) => rx.test(message))) {
    return topicRefusal('de', digest)
  }

  if (STBERG_OUT_OF_SCOPE_PATTERNS.some((rx) => rx.test(message))) {
    return {
      replyText:
        'Eine verbindliche Rechtsauskunft im Sinne des Steuerberatungsgesetzes oder eine Vertretung beim Finanzamt kann ich nicht übernehmen. Ich erkläre dir aber die Rechtslage genau, rechne mit dir durch, was sie für deine Erklärung bedeutet, und bereite mit dir vor, was du dem Finanzamt schreibst.',
      meta: {
        choices: ['Kanzlei-Endprüfung starten', 'Homeoffice-Pauschale prüfen', 'Spenden aus dem Vorjahr prüfen'],
      },
    }
  }

  return null
}

/**
 * Deterministic Kanzlei-Steuerberater engine ("Deine Eule").
 * Handles multi-turn Anamnese (clickable follow-up pills), Two-Paths comparisons,
 * exact tax delta simulations, and Kanzlei-Endprüfung.
 */
export function evaluateAdvisorTurn(input: {
  readonly message: string
  readonly activeScreen?: Screen | undefined
  readonly digest: CaseDigest
  readonly actionIdFactory?: (() => string) | undefined
}): {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
} {
  const { message, activeScreen, digest } = input
  const makeActionId = input.actionIdFactory ?? (() => `act-${Date.now()}`)
  const lower = message.toLowerCase()

  // 1. Obvious attacks & StBerG scope guardrail (topics are the guard's job, ADR-0069)
  const blocked = checkAdvisorInputBoundary(message, digest)
  if (blocked !== null) return blocked

  // 2. Kanzlei-Endprüfung (holistic pre-printout review)
  if (
    lower.includes('endprüfung') ||
    lower.includes('endpruefung') ||
    lower.includes('akte prüfen') ||
    lower.includes('alles komplett') ||
    lower.includes('bereit für den ausdruck')
  ) {
    const missingCount = digest.printoutMissingFields.length
    const openHintsCount = digest.openOwlHints.length
    const statusParts: string[] = []

    if (digest.lstbPersonA.grossWageEur) {
      statusParts.push(`• Lohnsteuerbescheinigung: Bruttolohn (${digest.lstbPersonA.grossWageEur.toLocaleString('de-DE')} €) ist erfasst.`)
    } else if (digest.crossBorder.isCrossBorderCh && digest.crossBorder.grossWageChf) {
      statusParts.push(`• Schweizer Lohnausweis: Bruttolohn (${digest.crossBorder.grossWageChf.toLocaleString('de-DE')} CHF) ist erfasst.`)
    } else {
      statusParts.push('• Einkommen: Lohnsteuerbescheinigung bzw. Lohnausweis ist noch nicht vollständig eingetragen.')
    }

    if (missingCount > 0) {
      statusParts.push(`• Pflichtfelder vor dem Ausdruck: Es fehlen noch ${missingCount} Angaben (${digest.printoutMissingFields.slice(0, 3).join(', ')}).`)
    } else {
      statusParts.push('• Pflichtfelder für den Ausdruck: Alle formalen Pflichtangaben sind vollständig.')
    }

    if (openHintsCount > 0) {
      statusParts.push(
        `• Offene Kanzlei-Hinweise: Wir haben noch ${openHintsCount} ungeklärte Spar-Chancen (${digest.openOwlHints.map((h) => h.title).join(', ')}).`,
      )
    } else {
      statusParts.push('• Kanzlei-Hinweise: Alle bekannten Musterlücken für dieses Steuerjahr sind geklärt.')
    }

    return {
      replyText: `Ich habe deine gesamte Steuerakte ${digest.taxYear} für die Kanzlei-Endprüfung durchgesehen:\n\n${statusParts.join('\n')}\n\nNach [estg-9-1] und [estg-10b] empfehle ich, vor der Freigabe noch die offenen Spar-Chancen kurz zu klären.`,
      meta: {
        sources: ['estg-9-1', 'estg-10b'],
        choices:
          openHintsCount > 0
            ? digest.openOwlHints.slice(0, 3).map((h) => `${h.title} klären`)
            : ['Homeoffice-Pauschale prüfen', 'Spenden prüfen', 'Fortbildungskosten prüfen'],
      },
    }
  }

  // 3. Spenden & Vorjahresvergleich (§ 10b EStG)
  if (lower.includes('spende') || lower.includes('zuwendung') || lower.includes('gemeinnützig')) {
    const explicitAmount = extractAmountNear(message, /spend|zuwendung|gemeinnützig/i)
    const priorYearDonations = digest.priorYearComparison.donationsEur ?? 200
    const usePriorYear = lower.includes('vorjahr') && !lower.includes('prüfen') && !lower.includes('klären')
    const targetAmount = explicitAmount ?? (usePriorYear ? priorYearDonations : null)

    if (targetAmount !== null) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'spenden-betrag', String(targetAmount))
      return {
        replyText: `Zuwendungen an gemeinnützige Organisationen mindern nach [estg-10b] direkt dein zu versteuerndes Einkommen als Sonderausgaben (bis 300 € je Einzelspende reicht der Kontoauszug als vereinfachter Nachweis). Ich habe dir den Eintrag über ${targetAmount} € vorbereitet:`,
        meta: {
          sources: ['estg-10b'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'spenden-betrag',
            instance: null,
            companionFields: { spenden: 'Ja' },
            label: 'Spenden & Zuwendungen (Sonderausgaben)',
            previousValue: sim.previousValue ? `${sim.previousValue} €` : '0 €',
            expectedPreviousValue: sim.previousValue,
            newValue: String(targetAmount),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Sonderausgabenabzug nach § 10b EStG mindert das zu versteuernde Einkommen ab dem ersten Euro über dem Pauschbetrag (36 €).',
            sourceId: 'estg-10b',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-10b'].paragraph,
          },
        },
      }
    }

    return {
      replyText: `Im Vorjahr hattest du ${priorYearDonations} € Spenden angesetzt. Nach [estg-10b] senken Spenden an gemeinnützige Vereine, Stiftungen oder Hilfsorganisationen dein zu versteuerndes Einkommen schon ab 37 € direkt. Wie hoch waren deine Spenden im Steuerjahr ${digest.taxYear}?`,
      meta: {
        sources: ['estg-10b'],
        choices: [
          `Wie im Vorjahr (${priorYearDonations} €) übernehmen`,
          '120 € Spenden eintragen',
          '300 € Spenden eintragen',
        ],
      },
    }
  }

  // 4. Homeoffice vs. Häusliches Arbeitszimmer (Zwei-Wege-Empfehlung § 4 Abs. 5 Nr. 6c EStG)
  if (lower.includes('homeoffice') || lower.includes('arbeitszimmer') || lower.includes('tagespauschale')) {
    const safeSim = simulateAdvisorFieldDelta(digest, 'interview', 'homeoffice', '1–2 Tage pro Woche')
    const maxSim = simulateAdvisorFieldDelta(digest, 'interview', 'homeoffice', 'Fast immer')

    return {
      replyText: `Beim Arbeiten von zu Hause haben wir nach [estg-4-5-6c] zwei steuerliche Wege: Die unbürokratische Tagespauschale (6 € pro Tag, bis zu 210 Tage = 1.260 €) ohne Raum-Nachweis oder den Maximal-Ansatz bei überwiegender Tätigkeit zu Hause. Hier ist der direkte Vorher/Nachher-Vergleich für deine Akte:`,
      meta: {
        sources: ['estg-4-5-6c'],
        twoPaths: {
          title: 'Zwei-Wege-Empfehlung: Homeoffice & Arbeitszimmer',
          sourceId: 'estg-4-5-6c',
          safePath: {
            actionId: `${makeActionId()}-safe`,
            status: 'pending',
            screen: 'interview',
            field: 'homeoffice',
            instance: null,
            label: 'Weg A (Sicher): Homeoffice 1–2 Tage/Woche',
            previousValue: digest.commuteAndWorkdays.homeOfficeAnswer ?? 'Nie',
            expectedPreviousValue: safeSim.previousValue,
            newValue: '1–2 Tage pro Woche',
            beforeRefundEur: safeSim.beforeRefundEur,
            afterRefundEur: safeSim.afterRefundEur,
            deltaEur: safeSim.deltaEur,
            reason: '6 € Tagespauschale ohne Nachweis eines separaten Arbeitszimmers (§ 4 Abs. 5 Nr. 6c EStG).',
            sourceId: 'estg-4-5-6c',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-4-5-6c'].paragraph,
          },
          maxPath: {
            actionId: `${makeActionId()}-max`,
            status: 'pending',
            screen: 'interview',
            field: 'homeoffice',
            instance: null,
            label: 'Weg B (Maximal): Fast immer im Homeoffice (bis 1.260 €)',
            previousValue: digest.commuteAndWorkdays.homeOfficeAnswer ?? 'Nie',
            expectedPreviousValue: maxSim.previousValue,
            newValue: 'Fast immer',
            beforeRefundEur: maxSim.beforeRefundEur,
            afterRefundEur: maxSim.afterRefundEur,
            deltaEur: maxSim.deltaEur,
            reason: 'Volle Ausschöpfung der 210 Homeoffice-Tage (1.260 € Werbungskosten).',
            evidenceHint: 'Nachweis-Hinweis: Das Finanzamt kann bei fast ausschließlichem Homeoffice eine kurze Bestätigung des Arbeitgebers anfordern.',
            sourceId: 'estg-4-5-6c',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-4-5-6c'].paragraph,
          },
        },
      },
    }
  }

  // 5. Fortbildung, Dienstreisen & Verpflegungsmehraufwand (§ 9 Abs. 1 Nr. 4a & Abs. 4a EStG)
  if (
    lower.includes('fortbildung') ||
    lower.includes('kurs') ||
    lower.includes('zertifikat') ||
    lower.includes('konferenz') ||
    lower.includes('dienstreise') ||
    lower.includes('fahrtkosten') ||
    lower.includes('übernachtung') ||
    lower.includes('8 std')
  ) {
    const hasDetails =
      lower.includes('8 std') ||
      lower.includes('übernachtung') ||
      lower.includes('online-kurs') ||
      extractFirstEuroAmount(message) !== null

    if (hasDetails) {
      // With an amount the draft records what the training cost; without one it only notes that
      // there was a training, and promises no effect it cannot calculate (#476).
      const statedCosts = extractFirstEuroAmount(message)
      const trainingField = statedCosts !== null ? 'fortbildung-kosten' : 'fortbildung'
      const trainingValue = statedCosts !== null ? String(statedCosts) : 'Ja'
      const sim = simulateAdvisorFieldDelta(digest, 'interview', trainingField, trainingValue)
      return {
        replyText: `Ausgezeichnet. Bei einer beruflichen Fortbildung zählen neben der Kursgebühr nach [estg-9-1-4a] jeder gefahrene Kilometer (0,30 € für Hin- **und** Rückfahrt) sowie nach [estg-9-4a] die Verpflegungspauschalen (14 € ab > 8 Std. Abwesenheit bzw. 28 € bei vollen 24-Stunden-Tagen). Ich habe die Fortbildungskosten für deine Werbungskosten vorbereitet:`,
        meta: {
          sources: ['estg-9-1-4a', 'estg-9-4a'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: trainingField,
            instance: null,
            ...(statedCosts !== null ? { companionFields: { fortbildung: 'Ja' } } : {}),
            label: statedCosts !== null ? 'Fortbildungskosten' : 'Berufliche Fortbildung vermerken',
            previousValue: statedCosts !== null ? sim.previousValue : digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein',
            expectedPreviousValue: sim.previousValue,
            newValue: trainingValue,
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Berücksichtigung von Kursgebühren, Reisekosten (§ 9 Abs. 1 Nr. 4a EStG) und Verpflegungsmehraufwand (§ 9 Abs. 4a EStG).',
            sourceId: 'estg-9-1-4a',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1-4a'].paragraph,
          },
        },
      }
    }

    return {
      replyText: `Bevor ich die Fortbildung durchrechne, brauche ich wie in der Kanzlei kurz zwei Eckdaten: Bei Fortbildungen sind nach [estg-9-1-4a] Hin- und Rückfahrt (0,30 €/km) und nach [estg-9-4a] Verpflegungspauschalen (14 € ab 8 Std. / 28 € bei Übernachtung) absetzbar, sofern der Arbeitgeber sie nicht steuerfrei erstattet hat. Wie lief deine Fortbildung ab?`,
      meta: {
        sources: ['estg-9-1-4a', 'estg-9-4a'],
        choices: [
          'Mehr als 8 Std. unterwegs (ohne Übernachtung)',
          'Mit Übernachtung, selbst bezahlt',
          'Online-Kurs von zu Hause (350 €)',
        ],
      },
    }
  }

  // 6. Arbeitsmittel, Laptop, Hardware, Berufskleidung (§ 9 Abs. 1 Nr. 6 EStG)
  if (
    lower.includes('laptop') ||
    lower.includes('monitor') ||
    lower.includes('computer') ||
    lower.includes('hardware') ||
    lower.includes('arbeitsmittel') ||
    lower.includes('berufskleidung') ||
    lower.includes('werkzeug') ||
    lower.includes('rein beruflich') ||
    lower.includes('hälftig beruflich')
  ) {
    const hasUsageShare =
      lower.includes('rein beruflich') ||
      lower.includes('hälftig beruflich') ||
      lower.includes('100 %') ||
      lower.includes('90 %') ||
      lower.includes('50 %') ||
      lower.includes('fachliteratur')

    if (hasUsageShare) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'fortbildung', 'Ja')
      return {
        replyText: `Nach [estg-9-1-6] (und dem BMF-Schreiben zur 1-jährigen Nutzungsdauer für Computerhardware und Software) kannst du den beruflichen Nutzungsanteil sofort im Anschaffungsjahr voll als Werbungskosten abziehen. Zusammen mit deinen übrigen Werbungskosten zählt jeder Euro über dem Arbeitnehmer-Pauschbetrag von 1.230 € ([estg-9-1]).`,
        meta: {
          sources: ['estg-9-1-6', 'estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'fortbildung',
            instance: null,
            label: 'Berufliche Arbeitsmittel & Fortbildung in Anlage N berücksichtigen',
            previousValue: digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein',
            expectedPreviousValue: sim.previousValue,
            newValue: 'Ja',
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Sofortabschreibung beruflicher Arbeitsmittel nach § 9 Abs. 1 Satz 3 Nr. 6 EStG.',
            sourceId: 'estg-9-1-6',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1-6'].paragraph,
          },
        },
      }
    }

    return {
      replyText: `Computerhardware, Software und Arbeitsmittel bis 800 € netto (952 € brutto) kannst du nach [estg-9-1-6] im Kaufjahr sofort absetzen — entscheidend für das Finanzamt ist der **berufliche Nutzungsanteil**. Wie nutzt du die Anschaffung?`,
      meta: {
        sources: ['estg-9-1-6'],
        choices: [
          'Rein beruflich (90–100 %), ca. 1.200 €',
          'Hälftig beruflich/privat (50 %), ca. 1.000 €',
          'Fachliteratur & Arbeitsmittel (250 €)',
        ],
      },
    }
  }

  // 7. Beruflicher Umzug (§ 9 Abs. 1 EStG)
  const relocationAmount = lower.includes('umzug') ? extractAmountNear(message, /umzug|umgezogen/i) : null
  if (relocationAmount !== null) {
    const amount = relocationAmount
    const sim = simulateAdvisorFieldDelta(digest, 'interview', 'umzug-kosten', String(amount))
    return {
      replyText: `Ein beruflich veranlasster Umzug (z. B. Jobwechsel oder Verkürzung des täglichen Arbeitswegs um mindestens eine Stunde) ist nach [estg-9-1] in voller Höhe als Werbungskosten absetzbar. Ich habe den Ansatz über ${amount} € vorbereitet:`,
      meta: {
        sources: ['estg-9-1'],
        action: {
          actionId: makeActionId(),
          status: 'pending',
          screen: 'interview',
          field: 'umzug-kosten',
          instance: null,
          companionFields: { umzug: 'Ja' },
          label: 'Berufliche Umzugskosten (Anlage N)',
          previousValue: sim.previousValue ? `${sim.previousValue} €` : '0 €',
          expectedPreviousValue: sim.previousValue,
          newValue: String(amount),
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: 'Werbungskostenabzug für beruflich veranlasste Umzugskosten (§ 9 Abs. 1 EStG).',
          sourceId: 'estg-9-1',
          paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
        },
      },
    }
  }

  // 8. Pendlerpauschale / Arbeitsweg (§ 9 Abs. 1 EStG)
  if (lower.includes('arbeitsweg') || lower.includes('pendler') || lower.includes('kilometer') || lower.includes('entfernung')) {
    const km = extractKilometers(message) ?? extractFirstEuroAmount(message)
    if (km !== null && km <= 999) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'weg', String(km))
      return {
        replyText: `Für deinen einfachen Arbeitsweg gelten nach [estg-9-1] 0,30 € für die ersten 20 km und **0,38 € ab dem 21. Entfernungskilometer**. Ich habe ${km} km einfachen Arbeitsweg für dich durchgerechnet:`,
        meta: {
          sources: ['estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'weg',
            instance: null,
            label: 'Einfacher Arbeitsweg (Entfernungspauschale)',
            previousValue: sim.previousValue ? `${sim.previousValue} km` : 'Nicht erfasst',
            expectedPreviousValue: sim.previousValue,
            newValue: String(km),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Entfernungspauschale (0,30 € bis 20 km, 0,38 € ab dem 21. km) nach § 9 Abs. 1 EStG.',
            sourceId: 'estg-9-1',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
          },
        },
      }
    }
  }

  // 9. Schweizer Grenzgänger (CH-Lohnausweis / Anlage N-Gre)
  if (
    lower.includes('schweiz') ||
    lower.includes('grenzgänger') ||
    lower.includes('lohnausweis') ||
    lower.includes('krankentaggeld') ||
    lower.includes('krankenkasse') ||
    activeScreen === 'chLohnausweis'
  ) {
    const chfAmount = extractAmountNear(message, /krankenkasse|krankentaggeld|krankenversicherung/i)
    if (chfAmount !== null) {
      const sim = simulateAdvisorFieldDelta(digest, 'chLohnausweis', 'krankenkasseChf', String(chfAmount))
      return {
        replyText: `Bei Schweizer Grenzgängern wird die Schweizer Quellensteuer (bis 4,5 %) auf die deutsche Einkommensteuer angerechnet, und deine selbst gezahlte Kranken- sowie Krankentaggeldversicherung mindern als Vorsorgeaufwendungen dein zu versteuerndes Einkommen. Hier ist der vorbereitete Eintrag für deine Krankenversicherung (${chfAmount} CHF):`,
        meta: {
          sources: ['estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'chLohnausweis',
            field: 'krankenkasseChf',
            instance: null,
            label: 'Schweizer Krankenversicherung (CHF)',
            previousValue: sim.previousValue ? `${sim.previousValue} CHF` : 'Nicht erfasst',
            expectedPreviousValue: sim.previousValue,
            newValue: String(chfAmount),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Berücksichtigung der Basis-Krankenversicherung für Grenzgänger in der Anlage Vorsorgeaufwand / N-Gre.',
            sourceId: 'estg-9-1',
            paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
          },
        },
      }
    }

    return {
      replyText: `Für deinen Schweizer Lohnausweis und die Anlage N-Gre achte ich besonders auf drei Hebel: die Anrechnung der max. 4,5 % CH-Quellensteuer, die Herausrechnung steuerfreier Familienzulagen und den Abzug deiner Schweizer Kranken- und Krankentaggeldversicherung ([estg-9-1]). Welchen Posten wollen wir uns ansehen?`,
      meta: {
        sources: ['estg-9-1'],
        choices: [
          'Krankenkasse (z. B. 4.200 CHF) eintragen',
          'Homeoffice-Pauschale prüfen',
          'Kanzlei-Endprüfung starten',
        ],
      },
    }
  }

  // 10. Kinder & Kinderbetreuung (§ 10 Abs. 1 Nr. 5 EStG)
  if (lower.includes('kind') || lower.includes('kita') || lower.includes('betreuung') || activeScreen === 'kind') {
    return {
      replyText: `Für jedes erfasste Kind prüft das Finanzamt automatisch die Günstigerprüfung zwischen gezahltem Kindergeld und den Kinderfreibeträgen. Zusätzlich sind Kinderbetreuungskosten (Kita, Tagesmutter, Hort bis 14 Jahre) nach [estg-10-1-5] zu 80 % (bis 4.800 € je Kind) als Sonderausgaben abziehbar, sofern du per Überweisung gezahlt hast.`,
      meta: {
        sources: ['estg-10-1-5'],
        choices: [
          'Homeoffice-Pauschale prüfen',
          'Spenden aus dem Vorjahr prüfen',
          'Kanzlei-Endprüfung starten',
        ],
      },
    }
  }

  // 11. Default contextual advisor response
  return {
    replyText: `Ich habe deine Akte ${digest.taxYear} im Blick. Sag mir einfach, welche Ausgaben du hattest — zum Beispiel Homeoffice-Tage ([estg-4-5-6c]), Fortbildung und Dienstreisen ([estg-9-1-4a]), Arbeitsmittel wie Laptop oder Fachliteratur ([estg-9-1-6]) oder Spenden ([estg-10b]). Ich rechne dir vorab die genaue Steuerwirkung aus, bevor wir etwas eintragen.`,
    meta: {
      sources: ['estg-4-5-6c', 'estg-9-1-6', 'estg-10b'],
      choices: [
        'Homeoffice-Pauschale (6 €/Tag) prüfen',
        'Fortbildung & Reisekosten klären',
        'Kanzlei-Endprüfung starten',
      ],
    },
  }
}
