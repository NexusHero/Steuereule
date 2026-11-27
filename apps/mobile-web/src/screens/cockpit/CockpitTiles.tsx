import { useEffect, useRef } from 'react'
import { useMoreTopicsExpanded } from './moreTopics'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, hapticSuccess, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useQueryClient } from '@tanstack/react-query'
import { GERMAN_JOB_TOO, type Answers, type Conflict, type Notice } from '@steuereule/core'
import {
  useBusinessControllerProfile,
  useCapitalControllerGet,
  useChSalaryCertificateControllerGet,
  useChildrenControllerList,
  useCommuteControllerGet,
  useLinkControllerGet,
  useLstbControllerGetLstb,
  usePensionControllerGet,
  useRentalControllerGet,
  type MasterDataResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { isRunningTaxYear } from '../../config/taxYear'
import type { PartnerAreaParam } from '../../navigation/routes'
import type { FunnelPath } from '../funnel/KontoWandScreen'
import { CockpitPartnerSection } from './CockpitPartnerSection'
import { derivePersonas } from './personas'
import { declaresSelfEmployment, useSelfEmploymentCapability } from '../business/useSelfEmployment'
import { tileStyles } from './tileStyles'
import { partnerAreasWithMissing, tilesWithMissing, type MissingItem } from './estimateMissing'
import { TILES, groupTiles, hasAnswersForEntry, isRequiredTile, isSettled, tileHintSeverity, type PartnerFacts, type TileDefinition, type TileFacts, type TileId, type TileStatus } from './tiles'

export function useCockpitTileFacts(
  year: number,
  enabled: boolean,
  path: FunnelPath | null,
  answers: Answers,
  masterData?: MasterDataResponseDto | null,
): TileFacts | null {
  const active = enabled && path !== null
  // A cross-border commuter may have had a German job earlier in the year (ADR-0079): the Strom asks for that certificate too.
  const lstb = useLstbControllerGetLstb(year, undefined, { query: { enabled: active && (path === 'angestellte' || path === 'ch') } })
  const ch = useChSalaryCertificateControllerGet(year, undefined, { query: { enabled: active && path === 'ch' } })
  const pension = usePensionControllerGet(year, undefined, { query: { enabled: active && path === 'rente' } })
  const commute = useCommuteControllerGet(year, undefined, { query: { enabled: active && path !== 'rente' } })
  const capital = useCapitalControllerGet(year, { query: { enabled: active } })
  const rental = useRentalControllerGet(year, { query: { enabled: active } })
  const hasChildren = answers.kinder !== undefined && answers.kinder !== 'Nein'
  const children = useChildrenControllerList(year, { query: { enabled: active && hasChildren } })
  const partner = usePartnerFacts(year, active && answers.familienstand === 'Verheiratet', answers)
  // The self-employment tile exists only with the server's switch on and a declared self-employment.
  const capability = useSelfEmploymentCapability()
  const selfEmployment = capability.enabled && declaresSelfEmployment(answers)
  const business = useBusinessControllerProfile(year, undefined, { query: { enabled: active && selfEmployment, retry: false } })

  if (!active || path === null) return null

  // Tiles whose query is still loading or failed: their status is unknown, so none is shown (honest states).
  // A failed one is also named as failed (WEB-45, NC-06): never „offen“, never the next step.
  const unknown = (q: { readonly isPending: boolean; readonly isError: boolean }) => q.isPending || q.isError
  const pendingTiles = new Set<TileId>()
  const failedTiles = new Set<TileId>()
  const failed = (id: TileId, on: boolean, q: { readonly isError: boolean }) => {
    if (on && q.isError) failedTiles.add(id)
  }
  failed('lstb', path === 'angestellte' || path === 'ch', lstb)
  failed('ch', path === 'ch', ch)
  failed('rente', path === 'rente', pension)
  failed('arbeitsweg', path !== 'rente', commute)
  failed('kapital', true, capital)
  failed('vermietung', true, rental)
  failed('kinder', hasChildren, children)
  failed('selbststaendig', selfEmployment, business)
  if ((path === 'angestellte' || path === 'ch') && unknown(lstb)) pendingTiles.add('lstb')
  if (path === 'ch' && unknown(ch)) pendingTiles.add('ch')
  if (path === 'rente' && unknown(pension)) pendingTiles.add('rente')
  if (path !== 'rente' && unknown(commute)) pendingTiles.add('arbeitsweg')
  if (unknown(capital)) pendingTiles.add('kapital')
  if (unknown(rental)) pendingTiles.add('vermietung')
  if (hasChildren && unknown(children)) pendingTiles.add('kinder')
  if (selfEmployment && unknown(business)) pendingTiles.add('selbststaendig')

  return {
    path,
    answers,
    masterData: masterData ?? null,
    ...(pendingTiles.size > 0 ? { pendingTiles } : {}),
    ...(failedTiles.size > 0 ? { failedTiles } : {}),
    lstb: lstb.data?.data ?? null,
    ch: ch.data?.data ?? null,
    pension: pension.data?.data ?? null,
    commute: commute.data?.data ?? null,
    capital: capital.data?.data ?? null,
    rental: rental.data?.data ?? null,
    children: children.data?.data ?? null,
    partner,
    ...(selfEmployment ? { selfEmployment: true, business: business.data?.data ?? null } : {}),
  }
}

/**
 * Person B of a joint return recorded in this account, and what is entered for B — loaded only for the
 * masks the basis says B has (ADR-0088). Undefined for a single user; null when B files separately or
 * has an account of their own.
 */
function usePartnerFacts(year: number, married: boolean, answers: Answers): PartnerFacts | null | undefined {
  const link = useLinkControllerGet(year, { query: { enabled: married } })
  const linkData = link.data?.data ?? null
  const joint = linkData !== null && linkData.filingType === 'zusammen' && !linkData.personBHasOwnAccount
  const job = answers['partner-job']
  const employed = married && joint && job === 'Angestellt'
  const swiss = employed && answers['partner-ausland'] === 'Ja, in die Schweiz'
  const B = { person: 'B' } as const
  const lstb = useLstbControllerGetLstb(year, B, { query: { enabled: employed } })
  const commute = useCommuteControllerGet(year, B, { query: { enabled: employed } })
  const ch = useChSalaryCertificateControllerGet(year, B, { query: { enabled: swiss } })
  const pension = usePensionControllerGet(year, B, { query: { enabled: married && joint && job === 'Rente' } })
  if (!married) return undefined
  if (link.isPending || link.isError) return { joint: false, name: null, birthDate: null, pending: true, ...(link.isError ? { failed: true } : {}) }
  if (!joint) return null
  const unknown = (q: { readonly isPending: boolean; readonly isError: boolean }, on: boolean) => on && (q.isPending || q.isError)
  const pending = unknown(lstb, employed) || unknown(commute, employed) || unknown(ch, swiss) || unknown(pension, married && job === 'Rente')
  const failedB = (employed && (lstb.isError || commute.isError)) || (swiss && ch.isError) || (married && job === 'Rente' && pension.isError)
  return {
    joint: true,
    name: linkData.personB?.firstName ?? null,
    birthDate: linkData.personB?.geburtsdatum ?? null,
    ...(pending ? { pending: true } : {}),
    ...(failedB ? { failed: true } : {}),
    lstb: lstb.data?.data ?? null,
    commute: commute.data?.data ?? null,
    ch: ch.data?.data ?? null,
    pension: pension.data?.data ?? null,
  }
}

/** Some areas could not be read: said once above the tiles, with a retry of exactly the failed reads. */
function FailedAreasNotice() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  return (
    <View accessibilityRole="alert" style={{ marginBottom: t.space.s3, gap: t.space.s2 }} testID="cockpit-bereiche-fehler">
      <Text style={{ ...t.type.body, color: t.color.fehler }}>{tr('cockpit.bereicheFehler')}</Text>
      <Button variant="ghost" onPress={() => void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' })} testID="cockpit-bereiche-erneut">
        {tr('apiFehler.retry')}
      </Button>
    </View>
  )
}

export function tileRevisitFlag(tile: TileDefinition, answers: Answers): boolean {
  return tile.route.screen === 'Catalog' && hasAnswersForEntry(tile.route.entry, answers)
}

export interface CockpitTilesProps {
  readonly facts: TileFacts
  readonly year?: number
  readonly isSignedIn?: boolean
  readonly isJointMarried?: boolean
  readonly partnerName?: string
  readonly conflicts?: readonly Conflict[]
  readonly notices?: readonly Notice[]
  readonly hasPositiveRefund?: boolean
  /** Steps of the user's path still open: the submission tile says how many stand before it. */
  readonly openSteps?: number | undefined
  /** What the estimate still lacks: the tile that holds it reads „Offen“ and says what is missing. */
  readonly estimateMissing?: readonly MissingItem[]
  readonly onOpenTile: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenSubmission?: () => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
}

export function CockpitTiles({
  facts,
  year,
  isSignedIn = false,
  isJointMarried = false,
  partnerName,
  conflicts = [],
  notices = [],
  hasPositiveRefund = false,
  openSteps,
  estimateMissing = [],
  onOpenTile,
  onOpenSubmission,
  onOpenPartner,
}: CockpitTilesProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [moreExpanded, setMoreExpanded] = useMoreTopicsExpanded()
  const prevStatusesRef = useRef<{ year: number | undefined; map: Map<TileId, TileStatus> }>({
    year,
    map: new Map(),
  })

  useEffect(() => {
    if (prevStatusesRef.current.year !== year) {
      prevStatusesRef.current = { year, map: new Map() }
    }
    const prev = prevStatusesRef.current.map
    let newlyCompleted = false
    for (const tile of TILES) {
      if (!tile.isVisible(facts)) continue
      if (facts.pendingTiles?.has(tile.id)) continue
      const nextStatus = tile.status(facts)
      const previousStatus = prev.get(tile.id)
      if (previousStatus !== undefined && previousStatus !== 'erledigt' && nextStatus === 'erledigt') {
        newlyCompleted = true
      }
      prev.set(tile.id, nextStatus)
    }
    if (newlyCompleted) {
      void hapticSuccess()
    }
  }, [facts, year])

  const personas = derivePersonas(facts.answers, facts.masterData)
  // UX review 2026-11: tiles are grouped by what is left to do, so progress shows at a glance.
  const missingByTile = tilesWithMissing(estimateMissing)
  const { required, optional, done, more } = groupTiles(facts, (id) => tileHintSeverity(id, conflicts, notices) !== null || missingByTile.has(id))
  /** A tile is not done while the estimate lacks something it holds (Echtdatenlauf 4). */
  const statusOf = (tile: TileDefinition): TileStatus => {
    const status = tile.status(facts)
    return status === 'erledigt' && missingByTile.has(tile.id) ? 'offen' : status
  }
  function renderMissing(tile: TileDefinition) {
    const items = missingByTile.get(tile.id)
    if (items === undefined) return null
    const list = items.map((item) => tr(`cockpit.erstattung.fehlt.${item.id}`)).join(', ')
    return (
      <Text style={styles.hintWarning} testID={`cockpit-kachel-${tile.id}-fehlt`}>
        {tr('cockpit.erstattung.fehlt.kachel', { liste: list })}
      </Text>
    )
  }
  const boosterTitleKey =
    personas.has('grenzgaenger') && !hasPositiveRefund
      ? 'cockpit.boosterUeberschrift.nachzahlung'
      : 'cockpit.boosterUeberschrift.erstattung'

  /** The status pill of a tile, the same on a card and on a row; none while the tile's data is still loading. */
  function renderBadge(tile: TileDefinition, status: TileStatus, isOptional: boolean) {
    if (facts.failedTiles?.has(tile.id)) {
      return (
        <View style={statusPillStyle('offen', styles)} testID={`cockpit-kachel-${tile.id}-badge`}>
          <Text style={styles.hintBlocker} testID={`cockpit-kachel-${tile.id}-fehler`}>
            {tr('cockpit.kachel.status.fehler')}
          </Text>
        </View>
      )
    }
    if (facts.pendingTiles?.has(tile.id)) return null
    return (
      <View style={isOptional ? styles.statusPillOptional : statusPillStyle(status, styles)} testID={`cockpit-kachel-${tile.id}-badge`}>
        {isOptional ? null : (
          <Text style={statusGlyphStyle(status, styles)} accessible={false} importantForAccessibility="no">
            {statusGlyph(status)}
          </Text>
        )}
        <Text style={isOptional ? styles.statusOptional : statusStyle(status, styles)} testID={`cockpit-kachel-${tile.id}-status`}>
          {isOptional ? tr('cockpit.kachel.status.optional') : statusLabel(status, tr)}
        </Text>
      </View>
    )
  }

  function renderTile(tile: TileDefinition) {
    const status = statusOf(tile)
    const revisit = tileRevisitFlag(tile, facts.answers)
    const severity = tileHintSeverity(tile.id, conflicts, notices)
    const isCompactDone = isSettled(status) && severity === null
    // An open tile that never blocks the return says so instead of reading like a duty.
    const isOptional = status === 'offen' && !isRequiredTile(tile, facts.path, facts) && !missingByTile.has(tile.id)
    return (
      <Pressable
        key={tile.id}
        accessibilityRole="button"
        onPress={() => onOpenTile(tile, revisit)}
        style={bp === 's' ? styles.tileWrapNarrow : styles.tileWrapWide}
        testID={`cockpit-kachel-${tile.id}`}
      >
        <Card variant="default" style={[styles.card, isCompactDone ? styles.cardDone : styles.cardActive]}>
          <View style={styles.tileHeaderRow}>
            <Text style={[styles.title, isCompactDone ? styles.titleDone : null]}>{tr(tile.titleKey)}</Text>
            {renderBadge(tile, status, isOptional)}
          </View>
          {/* UX review H2: every tile says which form it fills. */}
          <Text style={[styles.formular, isCompactDone ? styles.formularDone : null]} testID={`cockpit-kachel-${tile.id}-formular`}>
            {tr(`cockpit.kachel.${tile.id}.formular`)}
          </Text>
          {severity !== null ? (
            <Text
              style={severity === 'blocker' ? styles.hintBlocker : styles.hintWarning}
              testID={`cockpit-kachel-${tile.id}-hinweis`}
            >
              {tr(severity === 'blocker' ? 'cockpit.kachel.hinweis.blocker' : 'cockpit.kachel.hinweis.warnung')}
            </Text>
          ) : null}
          {renderMissing(tile)}
        </Card>
      </Pressable>
    )
  }

  /**
   * The same tile as one line of a list (UX review 2026-11): what is optional or done needs no card of
   * its own, so the open duties stand out and the screen gets shorter. Same test ids as the card.
   */
  function renderRow(tile: TileDefinition, index: number) {
    const status = statusOf(tile)
    const revisit = tileRevisitFlag(tile, facts.answers)
    const severity = tileHintSeverity(tile.id, conflicts, notices)
    const isOptional = status === 'offen' && !isRequiredTile(tile, facts.path, facts) && !missingByTile.has(tile.id)
    return (
      <Pressable
        key={tile.id}
        accessibilityRole="button"
        onPress={() => onOpenTile(tile, revisit)}
        style={[styles.row, index > 0 ? styles.rowDivider : null]}
        testID={`cockpit-kachel-${tile.id}`}
      >
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {tr(tile.titleKey)}
          </Text>
          <Text style={styles.formularDone} testID={`cockpit-kachel-${tile.id}-formular`}>
            {tr(`cockpit.kachel.${tile.id}.formular`)}
          </Text>
          {severity !== null ? (
            <Text style={severity === 'blocker' ? styles.hintBlocker : styles.hintWarning} testID={`cockpit-kachel-${tile.id}-hinweis`}>
              {tr(severity === 'blocker' ? 'cockpit.kachel.hinweis.blocker' : 'cockpit.kachel.hinweis.warnung')}
            </Text>
          ) : null}
          {renderMissing(tile)}
        </View>
        {renderBadge(tile, status, isOptional)}
      </Pressable>
    )
  }

  const anyFailed = (facts.failedTiles?.size ?? 0) > 0 || facts.partner?.failed === true
  return (
    <View style={styles.section} testID="cockpit-kacheln">
      {anyFailed ? <FailedAreasNotice /> : null}
      {isJointMarried ? (
        <Text style={styles.sectionHeading} testID="cockpit-bereich-du">
          {tr('cockpit.bereich.du')}
        </Text>
      ) : null}
      {required.length > 0 ? (
        <>
          <View style={styles.groupHeadingRow}>
            <Text style={styles.boosterHeading} testID="cockpit-bereich-pflicht">
              {tr('cockpit.gruppe.pflicht')}
            </Text>
            <Text style={styles.groupCount} testID="cockpit-bereich-pflicht-anzahl">
              {tr('cockpit.gruppe.offen', { count: required.length })}
            </Text>
          </View>
          <View style={styles.grid}>{required.map((tile) => renderTile(tile))}</View>
        </>
      ) : null}
      <View style={styles.groupHeadingRow}>
        <Text style={styles.boosterHeading} testID="cockpit-booster-ueberschrift">
          {tr(boosterTitleKey)}
        </Text>
        {optional.length > 0 ? <Text style={styles.groupCount}>{tr('cockpit.gruppe.optional')}</Text> : null}
      </View>
      {optional.length > 0 ? <View style={styles.rowList}>{optional.map((tile, index) => renderRow(tile, index))}</View> : null}
      {more.length > 0 ? (
        <View style={styles.moreBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreExpanded }}
            onPress={() => setMoreExpanded((v) => !v)}
            style={styles.moreToggle}
            testID="cockpit-weitere-themen"
          >
            <Text style={styles.moreToggleText}>{`${tr('cockpit.weitereThemen')} ${moreExpanded ? '▲' : '▼'}`}</Text>
          </Pressable>
          {moreExpanded ? <View style={styles.rowList}>{more.map((tile, index) => renderRow(tile, index))}</View> : null}
        </View>
      ) : null}
      {done.length > 0 ? (
        <>
          <View style={styles.groupHeadingRow}>
            <Text style={styles.boosterHeading} testID="cockpit-bereich-erledigt">
              {tr('cockpit.gruppe.erledigt')}
            </Text>
            <Text style={styles.groupCount} testID="cockpit-bereich-erledigt-anzahl">
              {String(done.length)}
            </Text>
          </View>
          <View style={styles.rowList}>{done.map((tile, index) => renderRow(tile, index))}</View>
        </>
      ) : null}
      {isJointMarried && year !== undefined && onOpenPartner ? (
        <CockpitPartnerSection
          year={year}
          partnerName={partnerName ?? tr('cockpit.bereich.partnerFallback')}
          enabled={isSignedIn}
          crossBorder={facts.answers['partner-ausland'] === 'Ja, in die Schweiz' || (facts.answers['partner-ausland'] === undefined && facts.answers.ausland === 'Ja, in die Schweiz')}
          partnerJob={facts.answers['partner-job']}
          partnerGermanJob={facts.answers['partner-de-job'] === GERMAN_JOB_TOO}
          openAreas={new Set(partnerAreasWithMissing(estimateMissing).keys())}
          onOpenPartner={onOpenPartner}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSubmission}
        style={styles.submissionWrap}
        testID="cockpit-abgabe-vorbereiten"
      >
        <Card variant="default" style={styles.card}>
          <Text style={styles.submissionTitle}>{tr('cockpit.abgabe.titel')}</Text>
          {openSteps !== undefined && openSteps > 0 ? (
            <Text style={styles.submissionHint} testID="cockpit-abgabe-offen">
              {tr('cockpit.abgabe.nochOffen', { count: openSteps })}
            </Text>
          ) : null}
          {year !== undefined && isRunningTaxYear(year) ? (
            <Text style={styles.submissionHint} testID="cockpit-abgabe-laufendes-jahr">
              {tr('cockpit.abgabe.laufendesJahr', { abgabeAb: year + 1 })}
            </Text>
          ) : null}
        </Card>
      </Pressable>
    </View>
  )
}

function statusLabel(status: TileStatus, tr: ReturnType<typeof useTranslation<typeof APP_NS>>['t']): string {
  if (status === 'erledigt') return tr('cockpit.kachel.status.erledigt')
  if (status === 'kein-thema') return tr('cockpit.kachel.status.keinThema')
  if (status === 'betrag-offen') return tr('cockpit.kachel.status.betragOffen')
  return tr('cockpit.kachel.status.offen')
}

function statusGlyph(status: TileStatus): string {
  if (status === 'erledigt') return '✓'
  if (status === 'kein-thema') return '–'
  if (status === 'betrag-offen') return '◷'
  return '!'
}

function statusPillStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): ViewStyle {
  if (status === 'erledigt') return styles.statusPillDone
  if (status === 'kein-thema') return styles.statusPillOptional
  if (status === 'betrag-offen') return styles.statusPillLater
  return styles.statusPillOpen
}

function statusGlyphStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): TextStyle {
  if (status === 'erledigt') return styles.statusDone
  if (status === 'kein-thema') return styles.statusOptional
  if (status === 'betrag-offen') return styles.statusLater
  return styles.statusOpen
}

function statusStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): TextStyle {
  if (status === 'erledigt') return styles.statusDone
  if (status === 'kein-thema') return styles.statusOptional
  if (status === 'betrag-offen') return styles.statusLater
  return styles.statusOpen
}

function makeStyles(t: UiTheme) {
  const tile = tileStyles(t)
  const { statusPillBase, statusBase } = tile
  const section: ViewStyle = {
    width: '100%',
    marginTop: t.space.s4,
    gap: t.space.s3,
  }
  const submissionWrap: ViewStyle = { width: '100%' }
  const submissionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const submissionHint: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s1 }
  const formularDone: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const statusPillLater: ViewStyle = { ...statusPillBase, backgroundColor: t.color.warnWeich }
  const statusPillOptional: ViewStyle = { ...statusPillBase, borderWidth: 1, borderColor: t.color.linieWeich }
  const statusLater: TextStyle = { ...statusBase, color: t.color.warn }
  const statusOptional: TextStyle = { ...statusBase, color: t.color.tinte2 }
  const groupHeadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.s2 }
  const rowList: ViewStyle = {
    width: '100%',
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte2,
    borderRadius: t.radius.m,
    backgroundColor: t.color.karte,
    overflow: 'hidden',
  }
  // 48 px keeps the row a comfortable touch target (WCAG 2.5.8).
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    minHeight: 48,
    paddingVertical: t.space.s2,
    paddingHorizontal: t.space.s4,
  }
  const rowDivider: ViewStyle = { borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const rowCopy: ViewStyle = { flex: 1, minWidth: 0 }
  // The text face, not the display face: a title like „Haushalt & Handwerker“ fits the line at 375 px.
  const rowTitle: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const groupCount: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  const hintBase: TextStyle = {
    ...t.type.captionStrong,
    marginTop: t.space.s1,
  }
  const hintBlocker: TextStyle = { ...hintBase, color: t.color.fehler }
  const hintWarning: TextStyle = { ...hintBase, color: t.color.warn }
  const boosterHeading: TextStyle = {
    ...t.type.subhead,
    color: t.color.tinte,
  }
  const sectionHeading: TextStyle = {
    ...t.type.itemTitle,
    color: t.color.tinte2,
  }
  const moreBlock: ViewStyle = { width: '100%', gap: t.space.s2 }
  const moreToggle: ViewStyle = { alignSelf: 'flex-start', paddingVertical: t.space.s1 }
  const moreToggleText: TextStyle = {
    ...t.type.label,
    color: t.color.tinte2,
  }

  return {
    ...tile,
    section,
    submissionWrap,
    submissionTitle,
    submissionHint,
    formularDone,
    statusPillLater,
    statusPillOptional,
    statusOptional,
    groupHeadingRow,
    groupCount,
    rowList,
    row,
    rowDivider,
    rowCopy,
    rowTitle,
    statusLater,
    hintBlocker,
    hintWarning,
    boosterHeading,
    sectionHeading,
    moreBlock,
    moreToggle,
    moreToggleText,
  }
}
