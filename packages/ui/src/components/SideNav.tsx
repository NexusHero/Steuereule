import { type ReactNode } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { hapticSelection } from '../lib/haptics'
import { useTheme } from '../theme/useTheme'
import type { TabItem } from './TabBar'

/** The rail's width; a screen next to it keeps this much free on its left. */
export const SIDE_NAV_WIDTH = 240
/** The compact rail of a tablet-wide window: icon over label, no brand name. */
export const SIDE_NAV_COMPACT_WIDTH = 84

/** How much room the rail takes in the given form. */
export function sideNavWidth(compact: boolean): number {
  return compact ? SIDE_NAV_COMPACT_WIDTH : SIDE_NAV_WIDTH
}

const ROW_HEIGHT = 44
const COMPACT_ROW_HEIGHT = 56
const COMPACT_LABEL_SIZE = 11

export interface SideNavProps {
  readonly tabs: readonly TabItem[]
  readonly active: string
  readonly onChange: (id: string) => void
  /** The brand at the top of the rail. */
  readonly header?: ReactNode
  /** Tablet form: a narrow rail with the icon over its label. */
  readonly compact?: boolean
  readonly testID?: string
}

/**
 * The app's navigation on a desktop-wide window (Graphit): the same tabs as the floating bar, as a
 * rail down the left edge. Same roles as the bar (`tablist` / `tab`), so a test or a screen reader
 * finds "Verlauf" the same way at every width. On a tablet-wide window it is `compact`: narrow,
 * icon over label. No lime here: the picked row is a quiet surface,
 * the accent stays with the screen's action.
 */
export function SideNav({ tabs, active, onChange, header, compact = false, testID }: SideNavProps) {
  const t = useTheme()
  const s = makeStyles(t, compact)
  return (
    <View style={s.rail} testID={testID}>
      {header === undefined ? null : <View style={s.header}>{header}</View>}
      <View style={s.list} accessibilityRole="tablist" role="tablist" aria-orientation="vertical">
        {tabs.map((tab) => {
          const on = tab.id === active
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                if (!on) void hapticSelection()
                onChange(tab.id)
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              aria-current={on ? 'page' : undefined}
              style={[s.row, on ? s.rowOn : null]}
            >
              {tab.icon}
              <Text style={[s.label, on ? s.labelOn : null]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>, compact: boolean) {
  const rail: ViewStyle = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: sideNavWidth(compact),
    zIndex: 10,
    backgroundColor: t.color.grund,
    borderRightWidth: t.space.kontur,
    borderRightColor: t.color.linieWeich,
    paddingHorizontal: compact ? t.space.s2 : t.space.s4,
    paddingTop: t.space.s5,
    paddingBottom: t.space.s4,
  }
  const header: ViewStyle = compact ? { alignItems: 'center', paddingBottom: t.space.s5 } : { paddingHorizontal: t.space.s3, paddingBottom: t.space.s5 }
  const list: ViewStyle = { gap: t.space.s1 }
  const row: ViewStyle = compact
    ? { minHeight: COMPACT_ROW_HEIGHT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: t.radius.s }
    : { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingHorizontal: t.space.s3, borderRadius: t.radius.s }
  const rowOn: ViewStyle = { backgroundColor: t.color.linieWeich }
  const label: TextStyle = { fontFamily: t.font.text, fontSize: compact ? COMPACT_LABEL_SIZE : t.size.m, fontWeight: t.weight.normal, color: t.color.tinte2 }
  const labelOn: TextStyle = { color: t.color.tinte, fontWeight: t.weight.halb }
  return { rail, header, list, row, rowOn, label, labelOn }
}
