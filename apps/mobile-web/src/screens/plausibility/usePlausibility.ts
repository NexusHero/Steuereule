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
  useMasterDataControllerRead,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { pathFromAnswers } from '../funnel/KontoWandScreen'

export type PlausibilityStatus = 'loading' | 'error' | 'ready'

export interface UsePlausibilityOptions {
  readonly enabled?: boolean
}

export interface PlausibilityHookResult {
  readonly status: PlausibilityStatus
  readonly conflicts: readonly Conflict[]
  readonly notices: readonly Notice[]
  readonly missingPersonalDetails: number | null
  readonly retry: () => void
}

function dataFromResponse(r: LstbResponseDto): WageTaxCertificateData {
  return {
    bruttoarbeitslohn: r.bruttoarbeitslohn as WageTaxCertificateFieldState,
    lohnsteuer: r.lohnsteuer as WageTaxCertificateFieldState,
    sozialversicherung: r.sozialversicherung as WageTaxCertificateFieldState,
  }
}

function foldInputs(data: WageTaxCertificateData, answers: Answers) {
  const facts = employeeFromData(data, answers)
  const rawLstbStatus = wageTaxCertificateStatus(data)
  const path = pathFromAnswers(answers)
  // Rentner and Swiss cross-border workers do not fill the German LStB; keep empty LStB unblocked there.
  const lstb =
    path === 'angestellte' || rawLstbStatus.kind === 'widerspruch'
      ? rawLstbStatus
      : { kind: 'vollstaendig' as const, bruttoarbeitslohn: 0, lohnsteuer: 0, sozialversicherung: 0 }

  return {
    lstb,
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
  const masterDataQuery = useMasterDataControllerRead({ query: { enabled } })

  const retry = () => {
    void lstbQuery.refetch()
    void interviewQuery.refetch()
    void masterDataQuery.refetch()
  }

  if (!enabled) {
    return { status: 'ready', conflicts: [], notices: [], missingPersonalDetails: null, retry }
  }

  if (lstbQuery.isPending || interviewQuery.isPending || masterDataQuery.isPending) {
    return { status: 'loading', conflicts: [], notices: [], missingPersonalDetails: null, retry }
  }

  if (
    lstbQuery.isError ||
    lstbQuery.data?.status !== 200 ||
    interviewQuery.isError ||
    interviewQuery.data?.status !== 200
  ) {
    return { status: 'error', conflicts: [], notices: [], missingPersonalDetails: null, retry }
  }

  const data = dataFromResponse(lstbQuery.data.data)
  const answers = interviewQuery.data.data.answers as Answers
  const result = checkPlausibility(foldInputs(data, answers))
  const missingPersonalDetails =
    masterDataQuery.data?.status === 200 ? masterDataQuery.data.data.missing.length : null

  return {
    status: 'ready',
    conflicts: result.kind === 'nicht-einreichbar' ? result.conflicts : [],
    notices: result.notices,
    missingPersonalDetails,
    retry,
  }
}
