import {
  calculateEmployeeStatus,
  checkPlausibility,
  employeeFromData,
  wageTaxCertificateStatus,
  type Answers,
  type Conflict,
  type Notice,
  type WageTaxCertificateData,
  type WageTaxCertificateFieldState,
} from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useLstbControllerGetLstb,
  usePrintoutControllerCheck,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { pathFromAnswers } from '../funnel/KontoWandScreen'
import { useSelfEmploymentCapability } from '../business/useSelfEmployment'

export type PlausibilityStatus = 'loading' | 'error' | 'ready'

export interface UsePlausibilityOptions {
  readonly enabled?: boolean
}

export interface PlausibilityHookResult {
  readonly status: PlausibilityStatus
  readonly conflicts: readonly Conflict[]
  readonly notices: readonly Notice[]
  /** What the printout check still names (the same list the printout blocks on); null when it could not be read. */
  readonly missingForPrintout: number | null
  /** Missing, but not needed for this return (`iban` for a payment). */
  readonly printoutHints: readonly string[]
  readonly answers: Answers
  readonly retry: () => void
  /** With `status: 'error'`: the failed read, for the shared wording of why (WEB-28). */
  readonly error?: unknown
}

function dataFromResponse(r: LstbResponseDto): WageTaxCertificateData {
  return {
    bruttoarbeitslohn: r.bruttoarbeitslohn as WageTaxCertificateFieldState,
    lohnsteuer: r.lohnsteuer as WageTaxCertificateFieldState,
    sozialversicherung: r.sozialversicherung as WageTaxCertificateFieldState,
  }
}

function foldInputs(data: WageTaxCertificateData, answers: Answers, selfEmployment: boolean) {
  const facts = employeeFromData(data, answers)
  const rawLstbStatus = wageTaxCertificateStatus(data)
  const path = pathFromAnswers(answers)
  // Rentner and Swiss cross-border workers do not fill the German LStB; keep empty LStB unblocked there.
  // With self-employment on, a pure „Selbstständig“ has no wage tax certificate to demand (for „Beides“ it stays required).
  const lstbRequired = path === 'angestellte' && !(selfEmployment && answers.job === 'Selbstständig')
  const lstb =
    lstbRequired || rawLstbStatus.kind === 'widerspruch'
      ? rawLstbStatus
      : { kind: 'vollstaendig' as const, bruttoarbeitslohn: 0, lohnsteuer: 0, sozialversicherung: 0 }

  return {
    lstb,
    // A workdays contradiction can never be stored: the commute PUT rejects it (ARBEITSTAGE_WIDERSPRUCH).
    workdays: { kind: 'bestimmt' as const, weekdays: 0, workdays: 0, commuteDays: 0 },
    status: calculateEmployeeStatus({
      income: facts.einnahmen,
      incomeRelatedExpenses: facts.werbungskosten,
      specialExpenses: facts.specialExpenses,
      openItems: facts.openItems,
      conflicts: facts.conflicts,
      gated: facts.gated,
    }),
    recordedNotCalculated: facts.recordedNotCalculated,
    answers,
  }
}

export function usePlausibility(
  taxYear: number,
  options: UsePlausibilityOptions = {},
): PlausibilityHookResult {
  const enabled = options.enabled ?? true
  const lstbQuery = useLstbControllerGetLstb(taxYear, undefined, { query: { enabled } })
  const interviewQuery = useInterviewControllerGetInterview(taxYear, undefined, { query: { enabled } })
  const printoutQuery = usePrintoutControllerCheck(taxYear, { query: { enabled } })
  const capability = useSelfEmploymentCapability()

  const retry = () => {
    void lstbQuery.refetch()
    void interviewQuery.refetch()
    void printoutQuery.refetch()
  }

  if (!enabled) {
    return { status: 'ready', conflicts: [], notices: [], missingForPrintout: null, printoutHints: [], answers: {}, retry }
  }

  if (lstbQuery.isPending || interviewQuery.isPending || printoutQuery.isPending || (enabled && capability.pending)) {
    return { status: 'loading', conflicts: [], notices: [], missingForPrintout: null, printoutHints: [], answers: {}, retry }
  }

  if (lstbQuery.isError || interviewQuery.isError) {
    const error: unknown = lstbQuery.error ?? interviewQuery.error
    return { status: 'error', conflicts: [], notices: [], missingForPrintout: null, printoutHints: [], answers: {}, retry, error }
  }

  const data = dataFromResponse(lstbQuery.data.data)
  const answers = interviewQuery.data.data.answers as Answers
  const result = checkPlausibility(foldInputs(data, answers, capability.enabled), { selfEmployment: capability.enabled })
  // The printout check only adds hints; when it fails, the count of missing details stays unknown (null).
  const printout = printoutQuery.data?.data ?? null

  return {
    status: 'ready',
    conflicts: result.kind === 'nicht-einreichbar' ? result.conflicts : [],
    notices: result.notices,
    missingForPrintout: printout === null ? null : printout.missing.length,
    printoutHints: printout?.hints ?? [],
    answers,
    retry,
  }
}
