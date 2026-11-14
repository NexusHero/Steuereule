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
import { SELECTABLE_TAX_YEARS, CURRENT_TAX_YEAR, isRunningTaxYear } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { pathFromAnswers, type FunnelPath } from '../funnel/KontoWandScreen'
import { usePlausibility } from '../plausibility/usePlausibility'
import { CockpitTiles, tileRevisitFlag, useCockpitTileFacts } from './CockpitTiles'
import { derivePersonas } from './personas'
import { nextStep, type TileDefinition, type TileFacts } from './tiles'
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
  readonly onOpenOwlMode?: (year: number) => void
  readonly onOpenPrintout?: (year: number) => void
  readonly onOpenSubmission?: (year: number) => void
  readonly onOpenConfirmation?: (year: number) => void
  readonly onContinuePath?: (path: FunnelPath) => void
  readonly onOpenTile?: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
  readonly onYearChange?: (year: number) => void
  readonly onOpenMasterData?: () => void
}

interface Next {
  readonly label: string
  readonly onPress: () => void
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
  onOpenPrintout,
  onOpenSubmission,
  onOpenConfirmation,
  onContinuePath,
  onOpenTile,
  onOpenPartner,
  onYearChange,
  onOpenMasterData,
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
  const missingDetails = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data.missing.length : 0
  const masterData: Next | null =
    // Stays reachable once complete: it is also the way back to the Veranlagungsart and the partner.
    onOpenMasterData === undefined
      ? null
      : {
          label: missingDetails > 0 ? tr('cockpit.stammdatenErgaenzen', { anzahl: missingDetails }) : tr('cockpit.stammdatenAnsehen'),
          onPress: onOpenMasterData,
        }
  const openTile = (tile: TileDefinition, revisit: boolean) => {
    // The next change of the estimate is attributed to this area (UX review H1, Wirkungszeile).
    rememberOpenedArea(year, tile.id)
    onOpenTile?.(tile, revisit)
  }
  const submissionHandler = onOpenSubmission ?? onOpenPrintout
  const step = tileFacts !== null ? nextStep(tileFacts) : null
  const next: Next | null =
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

  if (summary === null) {
    return (
      <CockpitEmpty
        year={year}
        onYearChange={setYear}
        refresh={refresh}
        isRefreshing={isRefreshing}
        next={next}
        tileFacts={tileFacts}
        isSignedIn={isSignedIn}
        isJointMarried={isJointMarried}
        partnerName={partnerName}
        findings={findings}
        onOpenTile={openTile}
        {...(onOpenPartner ? { onOpenPartner } : {})}
        {...(submissionHandler ? { onOpenSubmission: () => submissionHandler(year) } : {})}
        masterData={masterData}
        onOpenInterview={onOpenInterview}
        onOpenAssessment={onOpenAssessment}
        onOpenCapital={onOpenCapital}
        onOpenRental={onOpenRental}
        {...(onOpenKinder ? { onOpenKinder } : {})}
        {...(onOpenOwlMode ? { onOpenOwlMode: () => onOpenOwlMode(year) } : {})}
        {...(submissionHandler ? { onOpenPrintout: () => submissionHandler(year) } : {})}
        deadlineAnswers={deadlineAnswers}
        bp={bp}
      />
    )
  }
  return (
    <CockpitLoaded
      summary={summary}
      year={year}
      onYearChange={setYear}
      confirmation={confirmationQuery.data?.status === 200 ? confirmationQuery.data.data.annexes : null}
      {...(onOpenConfirmation ? { onOpenConfirmation: () => onOpenConfirmation(year) } : {})}
      refresh={refresh}
      isRefreshing={isRefreshing}
      next={next}
      tileFacts={tileFacts}
      isSignedIn={isSignedIn}
      isJointMarried={isJointMarried}
      partnerName={partnerName}
      findings={findings}
      onOpenTile={openTile}
      {...(onOpenPartner ? { onOpenPartner } : {})}
      {...(submissionHandler ? { onOpenSubmission: () => submissionHandler(year) } : {})}
      masterData={masterData}
      onOpenInterview={onOpenInterview}
      onOpenAssessment={onOpenAssessment}
      onOpenCapital={onOpenCapital}
      onOpenRental={onOpenRental}
      {...(onOpenKinder ? { onOpenKinder } : {})}
      {...(onOpenOwlMode ? { onOpenOwlMode: () => onOpenOwlMode(year) } : {})}
      {...(submissionHandler ? { onOpenPrintout: () => submissionHandler(year) } : {})}
      deadlineAnswers={deadlineAnswers}
      bp={bp}
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
  readonly bp: Breakpoint
  readonly deadlineAnswers: Answers | null
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

function CockpitEmpty({ year, onYearChange, refresh, isRefreshing, next, tileFacts, isSignedIn, isJointMarried, partnerName, findings, onOpenTile, onOpenPartner, onOpenSubmission, masterData, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenOwlMode, deadlineAnswers, bp }: CockpitEmptyProps) {
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
        {next ? (
          <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
            {next.label}
          </Button>
        ) : tileFacts === null ? (
          <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
            {tr('cockpit.answerQuestions')}
          </Button>
        ) : null}
        {tileFacts !== null ? (
          <CockpitTiles
            facts={tileFacts}
            year={year}
            isSignedIn={isSignedIn}
            isJointMarried={isJointMarried}
            partnerName={partnerName}
            conflicts={findings.conflicts}
            notices={findings.notices}
            onOpenTile={onOpenTile}
            {...(onOpenPartner ? { onOpenPartner } : {})}
            {...(onOpenSubmission ? { onOpenSubmission } : {})}
          />
        ) : null}
        {onOpenOwlMode ? <View style={styles.berater}><OwlAdvisorCard onOpen={onOpenOwlMode} testID="cockpit-empty-eulen-modus" /></View> : null}
        {masterData ? (
          <Button variant="ghost" onPress={masterData.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
            {masterData.label}
          </Button>
        ) : null}
        <Button variant="ghost" onPress={onOpenAssessment} style={styles.secondaryCta} testID="cockpit-bescheid">
          {tr('cockpit.checkBescheid')}
        </Button>
        <Button variant="ghost" onPress={onOpenCapital} style={styles.secondaryCta} testID="cockpit-kapital">
          {tr('cockpit.checkKapital')}
        </Button>
        <Button variant="ghost" onPress={onOpenRental} style={styles.secondaryCta} testID="cockpit-vermietung">
          {tr('cockpit.checkVermietung')}
        </Button>
        {onOpenKinder ? (
          <Button variant="ghost" onPress={onOpenKinder} style={styles.secondaryCta} testID="cockpit-empty-kinder">
            {tr('cockpit.checkKinder')}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  )
}

interface ConfirmationNoticeProps {
  readonly annexes: readonly AnnexConfirmationDto[] | null
  readonly status: CockpitStatusDto
  readonly onOpenConfirmation?: () => void
}

function ConfirmationNotice({ annexes, status, onOpenConfirmation }: ConfirmationNoticeProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const open = (annexes ?? []).filter((a) => a.unconfirmed > 0)
  if (open.length === 0) return null
  const sum = status.kind === 'spanne' ? (status.unconfirmedSum ?? 0) : 0

  return (
    <Card variant="default" testID="bestaetigung-hinweis">
      <Text style={styles.help}>
        {sum > 0 ? tr('cockpit.bestaetigung.hinweis', { count: open.reduce((n, a) => n + a.unconfirmed, 0), summe: formatEuro(sum) }) : tr('cockpit.bestaetigung.hinweisOhneSumme')}
      </Text>
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
      {onOpenConfirmation ? (
        <Button variant="ghost" onPress={onOpenConfirmation} testID="bestaetigung-oeffnen">
          {tr('cockpit.bestaetigung.pruefen')}
        </Button>
      ) : null}
    </Card>
  )
}

interface CockpitLoadedProps {
  readonly summary: CockpitSummaryDto
  readonly year: number
  readonly onYearChange: (year: number) => void
  readonly confirmation: readonly AnnexConfirmationDto[] | null
  readonly onOpenConfirmation?: () => void
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
  readonly bp: Breakpoint
  readonly deadlineAnswers: Answers | null
}

function CockpitLoaded({ summary, year, onYearChange, confirmation, onOpenConfirmation, refresh, isRefreshing, next, tileFacts, isSignedIn, isJointMarried, partnerName, findings, onOpenTile, onOpenPartner, onOpenSubmission, masterData, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenOwlMode, onOpenPrintout, deadlineAnswers, bp }: CockpitLoadedProps) {
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
      <ConfirmationNotice annexes={confirmation} status={status} {...(onOpenConfirmation ? { onOpenConfirmation } : {})} />
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
          <NumericHero status={status} compact={refundFirst} />
        )}
        <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text>
        <Refund year={year} hideRange={refundFirst} />
      </Card>
      {next ? (
        <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
          {next.label}
        </Button>
      ) : hasOpenItems && tileFacts === null ? (
        <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      {tileFacts !== null ? (
        <CockpitTiles
          facts={tileFacts}
          year={year}
          isSignedIn={isSignedIn}
          isJointMarried={isJointMarried}
          partnerName={partnerName}
          conflicts={findings.conflicts}
          notices={findings.notices}
          onOpenTile={onOpenTile}
          {...(onOpenPartner ? { onOpenPartner } : {})}
          {...(onOpenSubmission ? { onOpenSubmission } : {})}
        />
      ) : null}
      {onOpenOwlMode ? <View style={styles.berater}><OwlAdvisorCard onOpen={onOpenOwlMode} /></View> : null}
      {masterData ? (
        <Button variant="ghost" onPress={masterData.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
          {masterData.label}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onPress={onOpenAssessment}
        style={styles.secondaryCta}
        testID="cockpit-bescheid"
      >
        {tr('cockpit.checkBescheid')}
      </Button>
      <Button
        variant="ghost"
        onPress={onOpenCapital}
        style={styles.secondaryCta}
        testID="cockpit-kapital"
      >
        {tr('cockpit.checkKapital')}
      </Button>
      <Button
        variant="ghost"
        onPress={onOpenRental}
        style={styles.secondaryCta}
        testID="cockpit-vermietung"
      >
        {tr('cockpit.checkVermietung')}
      </Button>
      {onOpenKinder ? (
        <Button
          variant="ghost"
          onPress={onOpenKinder}
          style={styles.secondaryCta}
          testID="cockpit-kinder"
        >
          {tr('cockpit.checkKinder')}
        </Button>
      ) : null}
      {onOpenPrintout ? (
        <Button variant="ghost" onPress={onOpenPrintout} style={styles.secondaryCta} testID="cockpit-ausdruck">
          {tr('ausdruck.cockpitCta')}
        </Button>
      ) : null}
    </ScrollView>
  )
}

function NumericHero({ status, compact = false }: { readonly status: CockpitStatusDto; readonly compact?: boolean }) {
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
