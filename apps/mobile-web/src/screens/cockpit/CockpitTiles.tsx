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
import type { PartnerAreaParam } from '../../navigation/routes'
import type { FunnelPath } from '../funnel/KontoWandScreen'
import { CockpitPartnerSection } from './CockpitPartnerSection'
import { derivePersonas } from './personas'
import { TILES, hasAnswersForEntry, partitionTiles, tileHintSeverity, type TileDefinition, type TileFacts, type TileId, type TileStatus } from './tiles'

export function useCockpitTileFacts(
  year: number,
  enabled: boolean,
  path: FunnelPath | null,
  answers: Answers,
  masterData?: MasterDataResponseDto | null,
): TileFacts | null {
  const active = enabled && path !== null
  const lstb = useLstbControllerGetLstb(year, undefined, { query: { enabled: active && path === 'angestellte' } })
  const ch = useChSalaryCertificateControllerGet(year, { query: { enabled: active && path === 'ch' } })
  const pension = usePensionControllerGet(year, { query: { enabled: active && path === 'rente' } })
  const commute = useCommuteControllerGet(year, undefined, { query: { enabled: active && path !== 'rente' } })
  const capital = useCapitalControllerGet(year, { query: { enabled: active } })
  const rental = useRentalControllerGet(year, { query: { enabled: active } })
  const hasChildren = answers.kinder !== undefined && answers.kinder !== 'Nein'
  const children = useChildrenControllerList(year, { query: { enabled: active && hasChildren } })

  if (!active || path === null) return null

  // Tiles whose query is still loading or failed: their status is unknown, so none is shown (honest states).
  const unknown = (q: { readonly isPending: boolean; readonly isError: boolean }) => q.isPending || q.isError
  const pendingTiles = new Set<TileId>()
  if (path === 'angestellte' && unknown(lstb)) pendingTiles.add('lstb')
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
  const { main, more } = partitionTiles(facts)
  const boosterTitleKey = personas.has('grenzgaenger')
    ? 'cockpit.boosterUeberschrift.nachzahlung'
    : 'cockpit.boosterUeberschrift.erstattung'

  function renderTile(tile: TileDefinition) {
    const status = tile.status(facts)
    const revisit = tileRevisitFlag(tile, facts.answers)
    const severity = tileHintSeverity(tile.id, conflicts, notices)
    return (
      <Pressable
        key={tile.id}
        accessibilityRole="button"
        onPress={() => onOpenTile(tile, revisit)}
        style={bp === 's' ? styles.tileWrapNarrow : styles.tileWrapWide}
        testID={`cockpit-kachel-${tile.id}`}
      >
        <Card variant="default" style={styles.card}>
          <Text style={styles.title}>{tr(tile.titleKey)}</Text>
          {facts.pendingTiles?.has(tile.id) ? null : (
            <Text style={statusStyle(status, styles)} testID={`cockpit-kachel-${tile.id}-status`}>
              {statusLabel(status, tr)}
            </Text>
          )}
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

  return (
    <View style={styles.section} testID="cockpit-kacheln">
      <Text style={styles.boosterHeading} testID="cockpit-booster-ueberschrift">
        {tr(boosterTitleKey)}
      </Text>
      {isJointMarried ? (
        <Text style={styles.sectionHeading} testID="cockpit-bereich-du">
          {tr('cockpit.bereich.du')}
        </Text>
      ) : null}
      <View style={styles.grid}>{main.map(renderTile)}</View>
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
          {moreExpanded ? <View style={styles.grid}>{more.map(renderTile)}</View> : null}
        </View>
      ) : null}
      {isJointMarried && year !== undefined && onOpenPartner ? (
        <CockpitPartnerSection
          year={year}
          partnerName={partnerName ?? tr('cockpit.bereich.partnerFallback')}
          enabled={isSignedIn}
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
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
  }
  const tileWrapNarrow: ViewStyle = {
    width: '100%',
  }
  const tileWrapWide: ViewStyle = {
    flexBasis: 260,
    flexGrow: 1,
  }
  const card: ViewStyle = {
    marginBottom: 0,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    ...t.shadow.hart,
  }
  const title: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const statusBase: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const statusOpen: TextStyle = { ...statusBase, color: t.color.tinte2 }
  const statusDone: TextStyle = { ...statusBase, color: t.color.ok }
  const statusLater: TextStyle = { ...statusBase, color: t.color.warn }
  const hintBase: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
    marginTop: t.space.s1,
  }
  const hintBlocker: TextStyle = { ...hintBase, color: t.color.fehler }
  const hintWarning: TextStyle = { ...hintBase, color: t.color.warn }
  const boosterHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
  }
  const sectionHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte2,
  }
  const moreBlock: ViewStyle = { width: '100%', gap: t.space.s2 }
  const moreToggle: ViewStyle = { alignSelf: 'flex-start', paddingVertical: t.space.s1 }
  const moreToggleText: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
    color: t.color.tinte2,
  }

  return {
    section,
    grid,
    tileWrapNarrow,
    tileWrapWide,
    submissionWrap,
    submissionTitle,
    card,
    title,
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
