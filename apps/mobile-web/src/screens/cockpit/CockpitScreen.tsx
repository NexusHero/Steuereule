import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Card, Chip, HerkunftsChip, hapticSelection, useTheme, useBreakpoint, type Breakpoint } from '@steuereule/ui'
import { DeadlinesBanner } from '../deadlines/DeadlinesBanner'
import { formatEuro, formatEuroRange, UNCERTAINTY_PER_ITEM, type Answers, type Conflict, type Notice } from '@steuereule/core'
import {
  useCockpitControllerGetCockpitSummary,
  useConfirmationControllerGet,
  useInterviewControllerGetInterview,
  useLinkControllerGet,
  useMasterDataControllerRead,
  useTaxEstimateControllerGet,
  type TaxEstimateDto,
  type AnnexConfirmationDto,
  type CockpitStatusDto,
  type CockpitSummaryDto,
} from '@steuereule/api-client'
import { OwlAdvisorCard } from '../advisor/OwlAdvisorCard'
import { useOptionalCopilotBridge } from '../advisor/CopilotBridgeProvider'
import { APP_NS } from '../../i18n/resources'
import type { PartnerAreaParam } from '../../navigation/routes'
import { SubmissionMarker } from './SubmissionMarker'
import { SELECTABLE_TAX_YEARS, CURRENT_TAX_YEAR, isRunningTaxYear } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { pathFromAnswers, type FunnelPath } from '../funnel/KontoWandScreen'
import { usePlausibility } from '../plausibility/usePlausibility'
import { CockpitTiles, tileRevisitFlag, useCockpitTileFacts } from './CockpitTiles'
import { useSelfEmploymentCapability } from '../business/useSelfEmployment'
import { derivePersonas } from './personas'
import { nextStep, type TileDefinition, type TileFacts } from './tiles'
import { nextOpenStep, stromProgress, type StromStep } from '../strom/stromPlan'
import { stromStepTitle } from '../strom/stromTitles'
import { CockpitInbox } from './CockpitInbox'
import { makeStyles } from './CockpitScreen.styles'
import { dismissEffect, observeMidpoint, rememberOpenedArea, type Effect } from './effectMemory'


const SELECTABLE_YEARS = SELECTABLE_TAX_YEARS

export interface CockpitScreenProps {
  readonly taxYear?: number
  readonly isSignedIn?: boolean
  /** The session is still resolving: no guest „Weiter“ button for a user who may well be signed in. */
  readonly sessionPending?: boolean
  readonly onOpenInterview?: () => void
  readonly onOpenAssessment?: () => void
  readonly onOpenCapital?: () => void
  readonly onOpenRental?: () => void
  readonly onOpenKinder?: () => void
  /** Opens the official Vordrucke on their own screen. */
  readonly onOpenOfficialForm?: (year: number) => void
  readonly onOpenOwlMode?: (year: number) => void
  /** Opens the Belege tab: the cockpit says how many documents wait there. */
  readonly onOpenReceipts?: () => void
  readonly onOpenPrintout?: (year: number) => void
  readonly onOpenSubmission?: (year: number) => void
  /** A year with self-employment is filed through Mein ELSTER: the way forward leads to the fill-in help (ADR-0101 §16). */
  readonly onOpenElsterHelp?: (year: number) => void
  readonly onOpenConfirmation?: (year: number) => void
  readonly onContinuePath?: (path: FunnelPath) => void
  readonly onOpenTile?: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
  readonly onYearChange?: (year: number) => void
  readonly onOpenMasterData?: () => void
  /** The Strom (ADR-0089): „Weiter“ leads to its next open step instead of the next tile. */
  readonly onOpenStrom?: (step: StromStep) => void
}

interface Next {
  readonly label: string
  readonly onPress: () => void
  readonly missingFields?: readonly string[]
}

export function CockpitScreen({
  taxYear = CURRENT_TAX_YEAR,
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
}: CockpitScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const [year, setYearInternal] = useState(taxYear)
  const setYear = (fresh: number) => {
    if (fresh !== year) void hapticSelection()
    setYearInternal(fresh)
    onYearChange?.(fresh)
  }
  const query = useCockpitControllerGetCockpitSummary(year)
  const selfEmployment = useSelfEmploymentCapability(year)
  const [pulling, setPulling] = useState(false)
  const confirmationQuery = useConfirmationControllerGet(year)
  const interviewQuery = useInterviewControllerGetInterview(year)
  const masterDataQuery = useMasterDataControllerRead()
  const masterDataValue = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data : null
  const interview = interviewQuery.data?.status === 200 ? interviewQuery.data.data : null
  const answers = (interview?.answers ?? {}) as Answers
  // H5: the deadline banner waits for the answers — whether the deadline binds depends on them.
  const deadlineAnswers = interviewQuery.isPending ? null : answers
  const path =interview?.nextStep.kind === 'done' ? pathFromAnswers(interview.answers) : null
  const personas = derivePersonas(answers, masterDataValue)
  const linkQuery = useLinkControllerGet(year, { query: { enabled: isSignedIn && path !== null && personas.has('verheiratet') } })
  const linkData = linkQuery.data?.status === 200 ? linkQuery.data.data : null
  const isJointMarried = personas.has('verheiratet') && linkData?.filingType === 'zusammen' && !linkData.personBHasOwnAccount
  const partnerName = linkData?.personB?.firstName?.trim() || tr('cockpit.bereich.partnerFallback')
  const tileFacts = useCockpitTileFacts(year, isSignedIn, path, answers, masterDataValue)
  const plausibility = usePlausibility(year, { enabled: isSignedIn })
  const findings: PlausibilityFindings =
    plausibility.status === 'ready'
      ? { conflicts: plausibility.conflicts, notices: plausibility.notices }
      : { conflicts: [], notices: [] }

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('cockpit.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('cockpit.loadError.heading')}
        message={tr('cockpit.loadError.message')}
        retryLabel={tr('cockpit.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
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
  const missingFields = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data.missing : []
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

  if (summary === null) return <CockpitEmpty {...shared} />
  return (
    <CockpitLoaded
      {...shared}
      summary={summary}
      confirmation={confirmationQuery.data?.status === 200 ? confirmationQuery.data.data.annexes : null}
      assistantTaskCount={confirmationQuery.data?.status === 200 ? (confirmationQuery.data.data.tasks ?? []).length : 0}
      {...(onOpenConfirmation ? { onOpenConfirmation: () => onOpenConfirmation(year) } : {})}
    />
  )
}

interface PlausibilityFindings {
  readonly conflicts: readonly Conflict[]
  readonly notices: readonly Notice[]
}

interface PullToRefresh {
  readonly pulling: boolean
  readonly onPull: () => void
}

function Refund({ year, hideRange = false }: { readonly year: number; readonly hideRange?: boolean }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const query = useTaxEstimateControllerGet(year)
  const estimate: TaxEstimateDto | null = query.data?.status === 200 ? query.data.data : null
  return (
    <>
      {hideRange ? null : <Text style={styles.refundLater} testID="cockpit-erstattung">{refundText(estimate, tr, i18n.language)}</Text>}
      {estimate?.kind === 'spanne' && estimate.churchTaxOpen ? (
        <Text style={styles.refundLater} testID="cockpit-kirchensteuer-offen">
          {estimate.churchTax?.kind === 'offen' && estimate.churchTax.reason
            ? tr(`cockpit.erstattung.kirchensteuerOffen.${estimate.churchTax.reason}`)
            : tr('cockpit.erstattung.kirchensteuer')}
        </Text>
      ) : null}
      {estimate?.kind === 'spanne' && estimate.churchTax?.kind === 'spanne' && estimate.churchTax.capOnApplication ? (
        <Text style={styles.refundLater} testID="cockpit-kirchensteuer-kappung">{tr('cockpit.erstattung.kirchensteuerKappung')}</Text>
      ) : null}
    </>
  )
}

/**
 * The refund or back payment as the hero's headline (UX review H1), with the effect of the last change
 * underneath: what moved, in which area and form, and by how much.
 */
function RefundHeadline({ year, estimate }: { readonly year: number; readonly estimate: TaxEstimateDto | null }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const result = estimate?.kind === 'spanne' ? (estimate.result ?? null) : null
  const midpoint = result === null ? null : Math.round((result.from + result.to) / 2)
  const [effect, setEffect] = useState<Effect | null>(null)
  useEffect(() => {
    setEffect(observeMidpoint(year, midpoint))
  }, [year, midpoint])
  if (result === null) return null
  // Exactly 0 € (e.g. a pension below the basic allowance) is neither a refund nor a back payment.
  const even = result.from === 0 && result.to === 0
  const label = even
    ? 'cockpit.hero.ergebnisLabel'
    : result.from >= 0
      ? 'cockpit.hero.erstattungLabel'
      : result.to <= 0
        ? 'cockpit.hero.nachzahlungLabel'
        : 'cockpit.hero.ergebnisLabel'
  const value =
    result.from === result.to
      ? formatEuro(Math.abs(result.from))
      : result.from >= 0 || result.to <= 0
        ? formatEuroRange(Math.min(Math.abs(result.from), Math.abs(result.to)), Math.max(Math.abs(result.from), Math.abs(result.to)))
        : tr('cockpit.hero.ergebnisSpanne', { nachzahlung: formatEuro(Math.abs(result.from)), erstattung: formatEuro(result.to) })
  return (
    // One element reads as the whole statement („Voraussichtliche Erstattung 483–544 €“) for screen readers and checks.
    <>
      <View testID="cockpit-erstattung">
        <Text style={styles.refundLabel}>{tr(label)}</Text>
        <Text style={styles.heroValue} testID="cockpit-erstattung-betrag">{value}</Text>
        {even ? <Text style={styles.effectLine} testID="cockpit-ausgeglichen">{tr('cockpit.hero.ausgeglichen')}</Text> : null}
      </View>
      {/* Outside the statement above: its euro amount is the change, not the estimate. */}
      {effect !== null && effect.deltaEur !== 0 ? (
        <Pressable accessibilityRole="button" accessibilityHint={tr('cockpit.wirkung.schliessen')} onPress={() => { dismissEffect(year); setEffect(null) }} testID="cockpit-wirkung">
          <Text style={styles.effectLine}>{effectText(effect, tr)}</Text>
        </Pressable>
      ) : null}
    </>
  )
}

function effectText(effect: Effect, tr: TFunction<typeof APP_NS>): string {
  const amount = formatEuro(Math.abs(effect.deltaEur))
  const direction = tr(effect.deltaEur > 0 ? 'cockpit.wirkung.mehr' : 'cockpit.wirkung.weniger', { betrag: amount })
  if (effect.area === null) return tr('cockpit.wirkung.ohneBereich', { wirkung: direction })
  return tr('cockpit.wirkung.mitBereich', {
    bereich: tr(`cockpit.kachel.${effect.area}.titel`),
    formular: tr(`cockpit.kachel.${effect.area}.formular`),
    wirkung: direction,
  })
}

function refundText(estimate: TaxEstimateDto | null, tr: TFunction<typeof APP_NS>, language: string): string {
  if (estimate === null) return tr('cockpit.hero.refundLater')
  if (estimate.kind === 'offen') {
    // A married person is never estimated as single (ADR-0054): say what unlocks the couple's estimate.
    if (estimate.missing?.includes('veranlagungsart')) return tr('cockpit.erstattung.veranlagungsartOffen')
    return tr('cockpit.erstattung.offen', { count: estimate.missing?.length ?? 0 })
  }
  if (estimate.kind === 'nicht-moeglich') return tr(`cockpit.erstattung.grund.${estimate.reason ?? 'unbekannt'}`)
  const { from, to } = estimate.result ?? { from: 0, to: 0 }
  const amount = (value: number) => Math.abs(value).toLocaleString(language === 'en' ? 'en-GB' : 'de-DE')
  // A range without width ("31.192 – 31.192 €") reads like a typo; it is one figure.
  if (from === to) return tr(from >= 0 ? 'cockpit.erstattung.erstattungRund' : 'cockpit.erstattung.nachzahlungRund', { betrag: amount(from) })
  if (from >= 0) return tr('cockpit.erstattung.erstattung', { von: amount(from), bis: amount(to) })
  if (to <= 0) return tr('cockpit.erstattung.nachzahlung', { von: amount(to), bis: amount(from) })
  return tr('cockpit.erstattung.offenesErgebnis', { nachzahlung: amount(from), erstattung: amount(to) })
}

function Appbar({ year, onYearChange, isRefreshing }: { readonly year: number; readonly onYearChange: (selectedYear: number) => void; readonly isRefreshing: boolean }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.appbar}>
      <View style={styles.appbarTitleReihe}>
        <Text style={styles.appbarTitle}>{tr('cockpit.appbarTitle')}</Text>
        {isRefreshing ? <ActivityIndicator size="small" color={t.color.tinte2} accessibilityLabel={tr('cockpit.refreshing')} /> : null}
      </View>
      {/* Under the title, across the full width: the years wrap into two lines at 375 px instead of five, and none is cut off. */}
      <View style={styles.jahrReihe} accessibilityLabel={tr('cockpit.jahrAuswahl')}>
        {SELECTABLE_YEARS.map((y) => (
          <Chip key={y} active={y === year} onPress={() => onYearChange(y)} testID={`jahr-${y}`}>
            {isRunningTaxYear(y) ? tr('cockpit.jahrLaeuft', { jahr: y }) : String(y)}
          </Chip>
        ))}
      </View>
    </View>
  )
}

/** The notices about the year itself: the running year's prepare mode (K2) and the deadline (H5). */
function YearNotices({ year, answers }: { readonly year: number; readonly answers: Answers | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      {isRunningTaxYear(year) ? (
        <View style={styles.runningYearNotice} testID="cockpit-laufendes-jahr">
          <Text style={styles.runningYearText}>{tr('cockpit.laufendesJahr', { jahr: year, abgabeAb: year + 1 })}</Text>
        </View>
      ) : null}
      <DeadlinesBanner taxYear={year} answers={answers} />
    </>
  )
}

interface CockpitEmptyProps {
  readonly year: number
  /** The year is filed through Mein ELSTER (self-employment): said in one line above the work area. */
  readonly filedViaElster?: boolean
  readonly onYearChange: (year: number) => void
  readonly refresh: PullToRefresh
  readonly isRefreshing: boolean
  readonly next: Next | null
  readonly tileFacts: TileFacts | null
  readonly isSignedIn: boolean
  readonly isJointMarried: boolean
  readonly partnerName: string
  readonly findings: PlausibilityFindings
  readonly onOpenTile: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
  readonly onOpenSubmission?: () => void
  readonly masterData: Next | null
  readonly onOpenInterview: () => void
  readonly onOpenAssessment: () => void
  readonly onOpenCapital: () => void
  readonly onOpenRental: () => void
  readonly onOpenKinder?: () => void
  readonly onOpenOwlMode?: () => void
  readonly onOpenPrintout?: () => void
  readonly onOpenOfficialForm?: () => void
  readonly bp: Breakpoint
  readonly deadlineAnswers: Answers | null
  readonly progress: Progress | null
  readonly onOpenReceipts?: () => void
}

interface Progress {
  readonly done: number
  readonly total: number
}

/** „3 von 6 Schritten erledigt“ with one segment per step: where the user stands, in one line. */
function ProgressLine({ progress }: { readonly progress: Progress | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  if (progress === null || progress.total === 0) return null
  const label = tr('cockpit.fortschritt', { erledigt: progress.done, count: progress.total })
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      // A progress bar without a name is announced as a bare number (WCAG 4.1.2): it carries the sentence itself.
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
      testID="cockpit-fortschritt"
    >
      <View style={styles.progressBar}>
        {Array.from({ length: progress.total }, (_, index) => (
          <View key={index} style={index < progress.done ? styles.progressSegmentDone : styles.progressSegment} />
        ))}
      </View>
      <Text style={styles.progressText} testID="cockpit-fortschritt-text">
        {label}
      </Text>
    </View>
  )
}

/** The quieter actions below the tiles; shared by the empty and the loaded Cockpit. */
function SecondaryActions({
  tileFacts,
  onOpenAssessment,
  onOpenOfficialForm,
  onOpenCapital,
  onOpenRental,
  onOpenKinder,
  onOpenPrintout,
  kinderTestID,
}: {
  readonly tileFacts: TileFacts | null
  readonly onOpenAssessment: () => void
  readonly onOpenOfficialForm?: (() => void) | undefined
  readonly onOpenCapital: () => void
  readonly onOpenRental: () => void
  readonly onOpenKinder?: (() => void) | undefined
  readonly onOpenPrintout?: (() => void) | undefined
  readonly kinderTestID: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const action = (label: string, onPress: () => void, testID: string) => (
    <View key={testID} style={styles.secondaryGridItem}>
      <Button variant="ghost" onPress={onPress} testID={testID}>
        {label}
      </Button>
    </View>
  )
  // Once tiles show, Kapital, Vermietung and Kinder are tiles or under „Weitere Themen“: only without
  // tiles (no interview answers yet) do they need a way in here.
  const withoutTiles = tileFacts === null
  return (
    <View style={styles.secondaryGrid}>
      {action(tr('cockpit.checkBescheid'), onOpenAssessment, 'cockpit-bescheid')}
      {onOpenOfficialForm ? action(tr('cockpit.amtlichesFormular'), onOpenOfficialForm, 'cockpit-formular') : null}
      {withoutTiles ? action(tr('cockpit.checkKapital'), onOpenCapital, 'cockpit-kapital') : null}
      {withoutTiles ? action(tr('cockpit.checkVermietung'), onOpenRental, 'cockpit-vermietung') : null}
      {withoutTiles && onOpenKinder ? action(tr('cockpit.checkKinder'), onOpenKinder, kinderTestID) : null}
      {onOpenPrintout ? action(tr('ausdruck.cockpitCta'), onOpenPrintout, 'cockpit-ausdruck') : null}
    </View>
  )
}

function MissingMasterDataNotice({ masterData }: { readonly masterData: Next }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [expanded, setExpanded] = useState(false)
  const missing = masterData.missingFields ?? []

  if (missing.length === 0) {
    return (
      <Button variant="ghost" onPress={masterData.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
        {masterData.label}
      </Button>
    )
  }

  return (
    <View style={styles.missingBox} testID="cockpit-stammdaten-box">
      <Button variant="ghost" onPress={masterData.onPress} testID="cockpit-stammdaten">
        {masterData.label}
      </Button>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={styles.missingToggleRow}
        testID="cockpit-stammdaten-details-toggle"
      >
        <Text style={styles.missingToggleText}>
          {`⚠️ ${tr('cockpit.stammdatenFehlendToggle', { anzahl: missing.length })} ${expanded ? '▴' : '▾'}`}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.missingChipRow} testID="cockpit-stammdaten-missing-list">
          {missing.map((field) => (
            <Pressable
              key={field}
              accessibilityRole="button"
              onPress={masterData.onPress}
              style={styles.missingChip}
              testID={`cockpit-stammdaten-missing-${field}`}
            >
              <Text style={styles.missingChipText}>{tr(`stammdaten.${field}`, field)} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function EuleBannerNotice() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const bridge = useOptionalCopilotBridge()
  const banner = bridge?.cockpitBanner
  if (!bridge || !banner) return null

  const provenance = bridge.bestTileProvenance(banner.screens)
  const provenanceLabel =
    provenance === 'beleg+eule'
      ? tr('cockpit.euleBanner.provenanceReceiptOwl', '📎 Beleg + Eule')
      : provenance === 'eule'
        ? tr('cockpit.euleBanner.provenanceOwl', '🦉 Von Eule')
        : provenance === 'nutzer'
          ? tr('cockpit.euleBanner.provenanceUser', '✓ Selbst eingetragen')
          : null

  return (
    <Card variant="ai" style={styles.euleBannerCard} testID="cockpit-eule-banner">
      <View style={styles.euleBannerRow}>
        <View style={styles.euleBannerCopy}>
          <Text style={styles.euleBannerTitle}>
            {tr('cockpit.euleBanner.applied', { count: banner.appliedCount })}
          </Text>
          {banner.lastDeltaEur > 0 ? (
            <Text style={styles.euleBannerEffect}>
              {tr('cockpit.euleBanner.effect', { betrag: formatEuro(banner.lastDeltaEur) })}
            </Text>
          ) : null}
          {provenanceLabel ? (
            <Text style={styles.euleBannerProvenance} testID="cockpit-provenance-chip">
              {provenanceLabel}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => bridge.dismissCockpitBanner()}
          style={styles.euleBannerDismissBtn}
          testID="cockpit-eule-banner-dismiss"
        >
          <Text style={styles.euleBannerDismissText}>{tr('cockpit.euleBanner.dismiss', '✕ Schließen')}</Text>
        </Pressable>
      </View>
    </Card>
  )
}

interface CockpitWorkAreaProps
  extends Pick<
    CockpitEmptyProps,
    'year' | 'tileFacts' | 'isSignedIn' | 'isJointMarried' | 'partnerName' | 'findings' | 'onOpenTile' | 'onOpenPartner' | 'onOpenSubmission' | 'masterData' | 'onOpenOwlMode' | 'progress' | 'onOpenReceipts'
  > {
  readonly hasPositiveRefund?: boolean
  readonly owlTestID?: string
}

/** Inbox, tiles, the owl card and the master-data notice — the same on the empty and the loaded Cockpit. */
function CockpitWorkArea({ year, tileFacts, isSignedIn, isJointMarried, partnerName, findings, onOpenTile, onOpenPartner, onOpenSubmission, masterData, onOpenOwlMode, progress, onOpenReceipts, hasPositiveRefund = false, owlTestID }: CockpitWorkAreaProps) {
  const styles = makeStyles(useTheme())
  return (
    <>
      {isSignedIn && onOpenReceipts ? <CockpitInbox onOpenReceipts={onOpenReceipts} /> : null}
      {masterData && (masterData.missingFields?.length ?? 0) > 0 ? <MissingMasterDataNotice masterData={masterData} /> : null}
      {tileFacts !== null ? (
        <CockpitTiles
          facts={tileFacts}
          year={year}
          isSignedIn={isSignedIn}
          isJointMarried={isJointMarried}
          partnerName={partnerName}
          conflicts={findings.conflicts}
          notices={findings.notices}
          hasPositiveRefund={hasPositiveRefund}
          openSteps={progress === null ? undefined : progress.total - progress.done}
          onOpenTile={onOpenTile}
          {...(onOpenPartner ? { onOpenPartner } : {})}
          {...(onOpenSubmission ? { onOpenSubmission } : {})}
        />
      ) : null}
      {onOpenOwlMode ? <View style={styles.berater}><OwlAdvisorCard onOpen={onOpenOwlMode} {...(owlTestID ? { testID: owlTestID } : {})} /></View> : null}
      {masterData && (masterData.missingFields?.length ?? 0) === 0 ? <MissingMasterDataNotice masterData={masterData} /> : null}
    </>
  )
}

function CockpitEmpty(props: CockpitEmptyProps) {
  const { year, onYearChange, refresh, isRefreshing, next, tileFacts, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenOfficialForm, deadlineAnswers, progress, bp } = props
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar year={year} onYearChange={onYearChange} isRefreshing={isRefreshing} />
      <YearNotices year={year} answers={deadlineAnswers} />
      <EuleBannerNotice />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <Text style={styles.help}>{tr('cockpit.empty.message')}</Text>
        <ProgressLine progress={progress} />
        {next ? (
          <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
            {next.label}
          </Button>
        ) : tileFacts === null ? (
          <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
            {tr('cockpit.answerQuestions')}
          </Button>
        ) : null}
        {props.filedViaElster ? (
        <Text style={styles.elsterHint} testID="cockpit-elster-hinweis">
          {tr('cockpit.elsterHinweis')}
        </Text>
      ) : null}
      <CockpitWorkArea {...props} owlTestID="cockpit-empty-eulen-modus" />
        <SecondaryActions
          tileFacts={tileFacts}
          onOpenAssessment={onOpenAssessment}
          onOpenOfficialForm={onOpenOfficialForm}
          onOpenCapital={onOpenCapital}
          onOpenRental={onOpenRental}
          onOpenKinder={onOpenKinder}
          kinderTestID="cockpit-empty-kinder"
        />
      </View>
    </ScrollView>
  )
}

interface ConfirmationNoticeProps {
  readonly annexes: readonly AnnexConfirmationDto[] | null
  /** Open tasks the user's assistant left (#547); the confirmation screen lists them. */
  readonly taskCount: number
  readonly status: CockpitStatusDto
  readonly onOpenConfirmation?: () => void
}

function ConfirmationNotice({ annexes, taskCount, status, onOpenConfirmation }: ConfirmationNoticeProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const open = (annexes ?? []).filter((a) => a.unconfirmed > 0)
  if (open.length === 0 && taskCount === 0) return null
  const sum = status.kind === 'spanne' ? (status.unconfirmedSum ?? 0) : 0

  return (
    <Card variant="default" testID="bestaetigung-hinweis">
      {open.length > 0 ? (
        <Text style={styles.help}>
          {sum > 0 ? tr('cockpit.bestaetigung.hinweis', { count: open.reduce((n, a) => n + a.unconfirmed, 0), summe: formatEuro(sum) }) : tr('cockpit.bestaetigung.hinweisOhneSumme')}
        </Text>
      ) : null}
      {open.map((a) => (
        <View key={a.annex} style={styles.uebernahmeZeile}>
          <Text style={styles.uebernahmeZeileText}>
            {tr('cockpit.bestaetigung.anlage', {
              anlage: tr(`bestaetigung.anlagen.${a.annex}`),
              anzahl: tr('bestaetigung.unbestaetigt', { count: a.unconfirmed }),
            })}
          </Text>
        </View>
      ))}
      {taskCount > 0 ? (
        <View style={styles.uebernahmeZeile} testID="bestaetigung-aufgaben">
          <Text style={styles.uebernahmeZeileText}>{tr('cockpit.bestaetigung.aufgaben', { count: taskCount })}</Text>
        </View>
      ) : null}
      {onOpenConfirmation ? (
        <Button variant="ghost" onPress={onOpenConfirmation} testID="bestaetigung-oeffnen">
          {open.length > 0 ? tr('cockpit.bestaetigung.pruefen') : tr('cockpit.bestaetigung.aufgabenAnsehen')}
        </Button>
      ) : null}
    </Card>
  )
}

interface CockpitLoadedProps extends CockpitEmptyProps {
  readonly summary: CockpitSummaryDto
  readonly confirmation: readonly AnnexConfirmationDto[] | null
  readonly assistantTaskCount: number
  readonly onOpenConfirmation?: () => void
}

function CockpitLoaded(props: CockpitLoadedProps) {
  const { summary, year, onYearChange, confirmation, onOpenConfirmation, refresh, isRefreshing, next, tileFacts, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenPrintout, onOpenOfficialForm, deadlineAnswers, progress, bp } = props
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems, status } = summary
  const hasOpenItems = openItems > 0
  const estimateQuery = useTaxEstimateControllerGet(year)
  const estimate: TaxEstimateDto | null = estimateQuery.data?.status === 200 ? estimateQuery.data.data : null
  // UX review H1: as soon as there is a range, the refund is the headline and the income the detail.
  const refundFirst = estimate?.kind === 'spanne'

  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar year={year} onYearChange={onYearChange} isRefreshing={isRefreshing} />
      <YearNotices year={year} answers={deadlineAnswers} />
      <EuleBannerNotice />
      <ConfirmationNotice annexes={confirmation} taskCount={props.assistantTaskCount} status={status} {...(onOpenConfirmation ? { onOpenConfirmation } : {})} />
      <Card variant="nacht">
        {refundFirst ? (
          <>
            <RefundHeadline year={year} estimate={estimate} />
            <View style={styles.heroDivider} />
          </>
        ) : null}
        <Text style={styles.heroLabel}>{tr('cockpit.hero.label')}</Text>
        {status.kind === 'gated' ? (
          <GatedHero status={status} />
        ) : (
          <NumericHero status={status} compact={refundFirst} byPerson={summary.byPerson} partnerName={props.partnerName} />
        )}
        {/* Zero open questions is no news: the progress line below says where the user stands. */}
        {hasOpenItems || progress === null ? <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text> : null}
        <Refund year={year} hideRange={refundFirst} />
      </Card>
      <ProgressLine progress={progress} />
      {next ? (
        <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
          {next.label}
        </Button>
      ) : hasOpenItems && tileFacts === null ? (
        <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      {props.filedViaElster ? (
        <Text style={styles.elsterHint} testID="cockpit-elster-hinweis">
          {tr('cockpit.elsterHinweis')}
        </Text>
      ) : null}
      <CockpitWorkArea {...props} hasPositiveRefund={estimate?.kind === 'spanne' && (estimate.result?.from ?? 0) > 0} />
      <SecondaryActions
        tileFacts={tileFacts}
        onOpenAssessment={onOpenAssessment}
        onOpenOfficialForm={onOpenOfficialForm}
        onOpenCapital={onOpenCapital}
        onOpenRental={onOpenRental}
        onOpenKinder={onOpenKinder}
        onOpenPrintout={onOpenPrintout}
        kinderTestID="cockpit-kinder"
      />
      {/* After printing: the year is marked as filed, so the Verlauf shows it waiting for its Bescheid (ADR-0098). */}
      {props.isSignedIn && onOpenPrintout && !isRunningTaxYear(year) ? <SubmissionMarker year={year} submission={summary.submission ?? null} /> : null}
    </ScrollView>
  )
}

function NumericHero({
  status,
  compact = false,
  byPerson,
  partnerName,
}: {
  readonly status: CockpitStatusDto
  readonly compact?: boolean
  /** A joint return: the recorded wages of each person (Echtdatentest 18.11.2026). */
  readonly byPerson?: CockpitSummaryDto['byPerson']
  readonly partnerName: string
}) {
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(useTheme())
  const calculationPath =
    status.kind === 'spanne'
      ? tr('cockpit.hero.herkunftRechenweg', { count: status.openItems ?? 0, perItem: formatEuro(UNCERTAINTY_PER_ITEM) })
      : undefined
  const source = calculationPath === undefined ? { rule: tr('cockpit.hero.herkunftRegel') } : { rule: tr('cockpit.hero.herkunftRegel'), calculationPath }
  return (
    <>
      <Text style={compact ? styles.heroValueSmall : styles.heroValue} testID="cockpit-einkommen">
        {heroDisplay(status, tr('cockpit.hero.nochOffen'))}
      </Text>
      {status.kind === 'spanne' && (status.openItems ?? 0) > 0 ? (
        <Text style={styles.offenePosten}>{tr('cockpit.hero.offenePosten', { count: status.openItems ?? 0 })}</Text>
      ) : null}
      {byPerson ? (
        <Text style={styles.offenePosten} testID="cockpit-einkommen-personen">
          {tr('cockpit.hero.proPerson', { du: formatEuro(byPerson.a), name: partnerName, partner: formatEuro(byPerson.b) })}
        </Text>
      ) : null}
      <HerkunftsChip source={source} />
    </>
  )
}

/**
 * A range that starts at 0 € only says "nothing reliable is entered yet" — "0–120 €" would read as a
 * real figure, so the hero says the income is still open instead.
 */
function heroDisplay(status: CockpitStatusDto, stillOpen: string): string {
  if (status.kind === 'bestimmt') return formatEuro(status.value ?? 0)
  if ((status.from ?? 0) === 0) return stillOpen
  return formatEuroRange(status.from ?? 0, status.to ?? 0)
}

function GatedHero({ status }: { readonly status: CockpitStatusDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      <Text style={styles.gatedHeading}>{tr('cockpit.hero.gatedHeading')}</Text>
      {(status.gated ?? []).map((name) => (
        <Text key={name} style={styles.gatedBody}>
          {tr('cockpit.hero.gatedBody', { name })}
        </Text>
      ))}
    </>
  )
}
