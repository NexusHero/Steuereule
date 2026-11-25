import { useState } from 'react'
import type { TFunction } from 'i18next'
import { hapticSelection, type Breakpoint } from '@steuereule/ui'
import type { Answers } from '@steuereule/core'
import {
  useCockpitControllerGetCockpitSummary,
  useConfirmationControllerGet,
  useInterviewControllerGetInterview,
  useLinkControllerGet,
  useMasterDataControllerRead,
  type AnnexConfirmationDto,
  type CockpitSummaryDto,
} from '@steuereule/api-client'
import type { APP_NS } from '../../i18n/resources'
import { runningTaxYear } from '../../config/taxYear'
import { pathFromAnswers } from '../funnel/KontoWandScreen'
import { usePlausibility } from '../plausibility/usePlausibility'
import { tileRevisitFlag, useCockpitTileFacts } from './CockpitTiles'
import { useSelfEmploymentCapability } from '../business/useSelfEmployment'
import { derivePersonas } from './personas'
import { nextStep, type TileDefinition } from './tiles'
import { nextOpenStep, stromProgress } from '../strom/stromPlan'
import { stromStepTitle } from '../strom/stromTitles'
import { rememberOpenedArea } from './effectMemory'
import type { CockpitEmptyProps, CockpitScreenProps, Next, PlausibilityFindings, PullToRefresh } from './cockpitTypes'

/** What the Cockpit shows: still loading, a failed summary, no summary yet, or the loaded year. */
export type CockpitView =
  | { readonly kind: 'pending' }
  | { readonly kind: 'error'; readonly error: unknown; readonly onRetry: () => void }
  | { readonly kind: 'empty'; readonly shared: CockpitEmptyProps }
  | {
      readonly kind: 'loaded'
      readonly shared: CockpitEmptyProps
      readonly summary: CockpitSummaryDto
      readonly confirmation: readonly AnnexConfirmationDto[] | null
      readonly assistantTaskCount: number
      readonly onOpenConfirmation?: () => void
    }

/** The Cockpit's reads and everything derived from them; the screen only picks the view. */
export function useCockpit(
  {
    taxYear = runningTaxYear(),
    isSignedIn = true,
    sessionPending = false,
    onOpenInterview = () => {},
    onOpenAssessment = () => {},
    onOpenCapital = () => {},
    onOpenRental = () => {},
    onOpenKinder,
    onOpenOwlMode,
    onOpenReceipts,
    onOpenPrintout,
    onOpenOfficialForm,
    onOpenSubmission,
    onOpenElsterHelp,
    onOpenConfirmation,
    onContinuePath,
    onOpenTile,
    onOpenPartner,
    onYearChange,
    onOpenMasterData,
    onOpenStrom,
  }: CockpitScreenProps,
  bp: Breakpoint,
  tr: TFunction<typeof APP_NS>,
): CockpitView {
  const [year, setYearInternal] = useState(taxYear)
  const setYear = (fresh: number) => {
    if (fresh !== year) void hapticSelection()
    setYearInternal(fresh)
    onYearChange?.(fresh)
  }
  const query = useCockpitControllerGetCockpitSummary(year)
  const selfEmployment = useSelfEmploymentCapability()
  const [pulling, setPulling] = useState(false)
  const confirmationQuery = useConfirmationControllerGet(year)
  const interviewQuery = useInterviewControllerGetInterview(year)
  const masterDataQuery = useMasterDataControllerRead()
  const masterDataValue = masterDataQuery.data?.data ?? null
  const interview = interviewQuery.data?.data ?? null
  const answers = (interview?.answers ?? {}) as Answers
  // H5: the deadline banner waits for the answers — whether the deadline binds depends on them.
  const deadlineAnswers = interviewQuery.isPending ? null : answers
  const path = interview?.nextStep.kind === 'done' ? pathFromAnswers(interview.answers) : null
  const personas = derivePersonas(answers, masterDataValue)
  const linkQuery = useLinkControllerGet(year, { query: { enabled: isSignedIn && path !== null && personas.has('verheiratet') } })
  const linkData = linkQuery.data?.data ?? null
  const isJointMarried = personas.has('verheiratet') && linkData?.filingType === 'zusammen' && !linkData.personBHasOwnAccount
  const partnerName = linkData?.personB?.firstName?.trim() || tr('cockpit.bereich.partnerFallback')
  const tileFacts = useCockpitTileFacts(year, isSignedIn, path, answers, masterDataValue)
  const plausibility = usePlausibility(year, { enabled: isSignedIn })
  const findings: PlausibilityFindings =
    plausibility.status === 'ready'
      ? { conflicts: plausibility.conflicts, notices: plausibility.notices }
      : { conflicts: [], notices: [] }

  if (query.isPending) {
    return { kind: 'pending' }
  }
  if (query.isError) {
    return { kind: 'error', error: query.error, onRetry: () => void query.refetch() }
  }
  // WEB-45, NC-06: without the answers the cockpit cannot tell which areas exist or what is done; a failed
  // interview read is a failed cockpit, never a cockpit „wie neu“ whose next step points into a finished area.
  if (interviewQuery.isError) {
    return { kind: 'error', error: interviewQuery.error, onRetry: () => void interviewQuery.refetch() }
  }
  const summary = query.data.data
  const refresh: PullToRefresh = {
    pulling,
    onPull: () => {
      setPulling(true)
      void query.refetch().finally(() => setPulling(false))
    },
  }
  const isRefreshing = query.isFetching && !pulling
  const missingFields = masterDataQuery.data?.data.missing ?? []
  const missingDetails = missingFields.length
  const masterData: Next | null =
    // Stays reachable once complete: it is also the way back to the Veranlagungsart and the partner.
    onOpenMasterData === undefined
      ? null
      : {
          label: missingDetails > 0 ? tr('cockpit.stammdatenErgaenzen', { anzahl: missingDetails }) : tr('cockpit.stammdatenAnsehen'),
          onPress: onOpenMasterData,
          missingFields,
        }
  const openTile = (tile: TileDefinition, revisit: boolean) => {
    // The next change of the estimate is attributed to this area (UX review H1, Wirkungszeile).
    rememberOpenedArea(year, tile.id)
    onOpenTile?.(tile, revisit)
  }
  const filedViaElster = summary?.filingPath === 'elster-ausfuellhilfe' && onOpenElsterHelp !== undefined
  const submissionHandler = filedViaElster ? onOpenElsterHelp : (onOpenSubmission ?? onOpenPrintout)
  const step = tileFacts !== null ? nextStep(tileFacts) : null
  const stromStep = tileFacts !== null && onOpenStrom !== undefined ? nextOpenStep(answers, tileFacts, selfEmployment.options) : null
  const stromNext: Next | null =
    tileFacts === null || onOpenStrom === undefined || stromStep === null
      ? null
      : stromStep.kind === 'fertig'
        ? { label: tr('cockpit.naechsterSchritt', { titel: tr('cockpit.abgabe.titel') }), onPress: () => submissionHandler?.(year) }
        : { label: tr('cockpit.naechsterSchritt', { titel: stromStepTitle(stromStep, tr, partnerName) }), onPress: () => onOpenStrom(stromStep) }
  const next: Next | null = onOpenStrom !== undefined && tileFacts !== null ? stromNext :
    tileFacts !== null && step !== null
      ? step.kind === 'unknown'
        ? null
        : step.kind === 'tile'
        ? {
            label: tr('cockpit.naechsterSchritt', { titel: tr(step.tile.titleKey) }),
            onPress: () => openTile(step.tile, tileRevisitFlag(step.tile, tileFacts.answers)),
          }
        : {
            label: tr('cockpit.naechsterSchritt', { titel: tr('cockpit.abgabe.titel') }),
            onPress: () => submissionHandler?.(year),
          }
      : path !== null && onContinuePath && !sessionPending
        ? { label: tr('cockpit.weiterMitDeinemWeg', { pfad: tr(`funnel.kontoWand.pfad.${path}`) }), onPress: () => onContinuePath(path) }
        : null

  const progress = stromProgress(answers, tileFacts, selfEmployment.options)

  const shared: CockpitEmptyProps = {
    progress,
    ...(onOpenReceipts ? { onOpenReceipts } : {}),
    year,
    onYearChange: setYear,
    refresh,
    isRefreshing,
    next,
    tileFacts,
    isSignedIn,
    isJointMarried,
    partnerName,
    findings,
    filedViaElster,
    onOpenTile: openTile,
    ...(onOpenPartner ? { onOpenPartner } : {}),
    ...(submissionHandler ? { onOpenSubmission: () => submissionHandler(year), onOpenPrintout: () => submissionHandler(year) } : {}),
    masterData,
    onOpenInterview,
    onOpenAssessment,
    onOpenCapital,
    onOpenRental,
    ...(onOpenKinder ? { onOpenKinder } : {}),
    ...(onOpenOfficialForm ? { onOpenOfficialForm: () => onOpenOfficialForm(year) } : {}),
    ...(onOpenOwlMode ? { onOpenOwlMode: () => onOpenOwlMode(year) } : {}),
    deadlineAnswers,
    bp,
  }

  if (summary === null) return { kind: 'empty', shared }
  return {
    kind: 'loaded',
    shared,
    summary,
    confirmation: confirmationQuery.data?.data.annexes ?? null,
    assistantTaskCount: (confirmationQuery.data?.data.tasks ?? []).length,
    ...(onOpenConfirmation ? { onOpenConfirmation: () => onOpenConfirmation(year) } : {}),
  }
}
