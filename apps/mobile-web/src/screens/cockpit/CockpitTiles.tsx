import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, hapticSuccess, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { Answers, Conflict, Notice } from '@steuereule/core'
import {
  useCapitalControllerGet,
  useChSalaryCertificateControllerGet,
  useChildrenControllerList,
  useCommuteControllerGet,
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
import { TILES, groupTiles, hasAnswersForEntry, isRequiredTile, tileHintSeverity, type TileDefinition, type TileFacts, type TileId, type TileStatus } from './tiles'

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

  if (!active || path === null) return null

  // Tiles whose query is still loading or failed: their status is unknown, so none is shown (honest states).
  const unknown = (q: { readonly isPending: boolean; readonly isError: boolean }) => q.isPending || q.isError
  const pendingTiles = new Set<TileId>()
  if ((path === 'angestellte' || path === 'ch') && unknown(lstb)) pendingTiles.add('lstb')
  if (path === 'ch' && unknown(ch)) pendingTiles.add('ch')
  if (path === 'rente' && unknown(pension)) pendingTiles.add('rente')
  if (path !== 'rente' && unknown(commute)) pendingTiles.add('arbeitsweg')
  if (unknown(capital)) pendingTiles.add('kapital')
  if (unknown(rental)) pendingTiles.add('vermietung')
  if (hasChildren && unknown(children)) pendingTiles.add('kinder')

  return {
    path,
    answers,
    masterData: masterData ?? null,
    ...(pendingTiles.size > 0 ? { pendingTiles } : {}),
    lstb: lstb.data?.status === 200 ? lstb.data.data : null,
    ch: ch.data?.status === 200 ? ch.data.data : null,
    pension: pension.data?.status === 200 ? pension.data.data : null,
    commute: commute.data?.status === 200 ? commute.data.data : null,
    capital: capital.data?.status === 200 ? capital.data.data : null,
    rental: rental.data?.status === 200 ? rental.data.data : null,
    children: children.data?.status === 200 ? children.data.data : null,
  }
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
  onOpenTile,
  onOpenSubmission,
  onOpenPartner,
}: CockpitTilesProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [moreExpanded, setMoreExpanded] = useState(false)
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
  const { required, optional, done, more } = groupTiles(facts, (id) => tileHintSeverity(id, conflicts, notices) !== null)
  const boosterTitleKey =
    personas.has('grenzgaenger') && !hasPositiveRefund
      ? 'cockpit.boosterUeberschrift.nachzahlung'
      : 'cockpit.boosterUeberschrift.erstattung'

  /** The status pill of a tile, the same on a card and on a row; none while the tile's data is still loading. */
  function renderBadge(tile: TileDefinition, status: TileStatus, isOptional: boolean) {
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
    const status = tile.status(facts)
    const revisit = tileRevisitFlag(tile, facts.answers)
    const severity = tileHintSeverity(tile.id, conflicts, notices)
    const isCompactDone = status === 'erledigt' && severity === null
    // An open tile that never blocks the return says so instead of reading like a duty.
    const isOptional = status === 'offen' && !isRequiredTile(tile, facts.path)
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
        </Card>
      </Pressable>
    )
  }

  /**
   * The same tile as one line of a list (UX review 2026-11): what is optional or done needs no card of
   * its own, so the open duties stand out and the screen gets shorter. Same test ids as the card.
   */
  function renderRow(tile: TileDefinition, index: number) {
    const status = tile.status(facts)
    const revisit = tileRevisitFlag(tile, facts.answers)
    const severity = tileHintSeverity(tile.id, conflicts, notices)
    const isOptional = status === 'offen' && !isRequiredTile(tile, facts.path)
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
        </View>
        {renderBadge(tile, status, isOptional)}
      </Pressable>
    )
  }

  return (
    <View style={styles.section} testID="cockpit-kacheln">
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
  if (status === 'betrag-offen') return tr('cockpit.kachel.status.betragOffen')
  return tr('cockpit.kachel.status.offen')
}

function statusGlyph(status: TileStatus): string {
  if (status === 'erledigt') return '✓'
  if (status === 'betrag-offen') return '◷'
  return '!'
}

function statusPillStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): ViewStyle {
  if (status === 'erledigt') return styles.statusPillDone
  if (status === 'betrag-offen') return styles.statusPillLater
  return styles.statusPillOpen
}

function statusGlyphStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): TextStyle {
  if (status === 'erledigt') return styles.statusDone
  if (status === 'betrag-offen') return styles.statusLater
  return styles.statusOpen
}

function statusStyle(status: TileStatus, styles: ReturnType<typeof makeStyles>): TextStyle {
  if (status === 'erledigt') return styles.statusDone
  if (status === 'betrag-offen') return styles.statusLater
  return styles.statusOpen
}

function makeStyles(t: UiTheme) {
  const section: ViewStyle = {
    width: '100%',
    marginTop: t.space.s4,
    gap: t.space.s3,
  }
  const grid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s3,
    width: '100%',
  }
  const submissionWrap: ViewStyle = { width: '100%' }
  const submissionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const submissionHint: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s1 }
  const tileWrapNarrow: ViewStyle = {
    width: '100%',
  }
  const tileWrapWide: ViewStyle = {
    flexBasis: 260,
    flexGrow: 1,
  }
  // Tiles sit flat on the ground — the screen's one hard shadow belongs to its primary action.
  const card: ViewStyle = {
    marginBottom: 0,
    borderWidth: t.space.kontur,
    // tinte-2 (6:1) keeps a tappable tile recognisable — linie-weich is only ~1.3:1 (WCAG 1.4.11).
    borderColor: t.color.tinte2,
  }
  const cardDone: ViewStyle = {
    paddingVertical: t.space.s3,
    paddingHorizontal: t.space.s4,
    borderColor: t.color.linie,
    opacity: 0.92,
  }
  const cardActive: ViewStyle = {
    borderColor: t.color.tinte,
  }
  const tileHeaderRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s2,
    marginBottom: t.space.s1,
  }
  const title: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    flex: 1,
    flexShrink: 1,
  }
  const titleDone: TextStyle = {
    ...t.type.itemTitle,
    color: t.color.tinte,
  }
  const formular: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  const formularDone: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const statusPillBase: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.s2,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
  }
  const statusPillDone: ViewStyle = { ...statusPillBase, backgroundColor: t.color.okWeich }
  const statusPillLater: ViewStyle = { ...statusPillBase, backgroundColor: t.color.warnWeich }
  const statusPillOpen: ViewStyle = { ...statusPillBase, backgroundColor: t.color.funkeWeich }
  const statusPillOptional: ViewStyle = { ...statusPillBase, borderWidth: 1, borderColor: t.color.linieWeich }
  const statusBase: TextStyle = { ...t.type.label }
  const statusOpen: TextStyle = { ...statusBase, color: t.color.tinte }
  const statusDone: TextStyle = { ...statusBase, color: t.color.ok }
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
    section,
    grid,
    tileWrapNarrow,
    tileWrapWide,
    submissionWrap,
    submissionTitle,
    submissionHint,
    card,
    cardDone,
    cardActive,
    tileHeaderRow,
    title,
    titleDone,
    formular,
    formularDone,
    statusPillDone,
    statusPillLater,
    statusPillOpen,
    statusPillOptional,
    statusOptional,
    groupHeadingRow,
    groupCount,
    rowList,
    row,
    rowDivider,
    rowCopy,
    rowTitle,
    statusOpen,
    statusDone,
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
