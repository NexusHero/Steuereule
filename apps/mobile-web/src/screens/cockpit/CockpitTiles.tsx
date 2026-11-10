import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { Answers } from '@steuereule/core'
import {
  useCapitalControllerGet,
  useChSalaryCertificateControllerGet,
  useChildrenControllerList,
  useCommuteControllerGet,
  useLstbControllerGetLstb,
  usePensionControllerGet,
  useRentalControllerGet,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import type { FunnelPath } from '../funnel/KontoWandScreen'
import { hasAnswersForEntry, visibleTiles, type TileDefinition, type TileFacts, type TileStatus } from './tiles'

export function useCockpitTileFacts(
  year: number,
  enabled: boolean,
  path: FunnelPath | null,
  answers: Answers,
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

  return {
    path,
    answers,
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
  readonly onOpenTile: (tile: TileDefinition, revisit: boolean) => void
}

export function CockpitTiles({ facts, onOpenTile }: CockpitTilesProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const tiles = visibleTiles(facts)

  return (
    <View style={styles.grid} testID="cockpit-kacheln">
      {tiles.map((tile) => {
        const status = tile.status(facts)
        const revisit = tileRevisitFlag(tile, facts.answers)
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
              <Text style={statusStyle(status, styles)} testID={`cockpit-kachel-${tile.id}-status`}>
                {statusLabel(status, tr)}
              </Text>
            </Card>
          </Pressable>
        )
      })}
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
  const grid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s3,
    width: '100%',
    marginTop: t.space.s4,
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

  return {
    grid,
    tileWrapNarrow,
    tileWrapWide,
    card,
    title,
    statusOpen,
    statusDone,
    statusLater,
  }
}
