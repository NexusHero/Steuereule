import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'

/** Styles of a Cockpit tile card and its status pill, shared by the user's tiles and the partner's. */
export function tileStyles(t: UiTheme) {
  const grid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s3,
    width: '100%',
  }
  const tileWrapNarrow: ViewStyle = { width: '100%' }
  const tileWrapWide: ViewStyle = { flexBasis: 260, flexGrow: 1 }
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
    borderColor: t.color.linie,
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
  const statusPillBase: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.s2,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
  }
  const statusPillDone: ViewStyle = { ...statusPillBase, backgroundColor: t.color.okWeich }
  const statusPillOpen: ViewStyle = { ...statusPillBase, backgroundColor: t.color.funkeWeich }
  const statusBase: TextStyle = { ...t.type.label }
  const statusOpen: TextStyle = { ...statusBase, color: t.color.tinte }
  const statusDone: TextStyle = { ...statusBase, color: t.color.ok }

  return {
    grid,
    tileWrapNarrow,
    tileWrapWide,
    card,
    cardDone,
    cardActive,
    tileHeaderRow,
    title,
    titleDone,
    formular,
    statusPillBase,
    statusPillDone,
    statusPillOpen,
    statusBase,
    statusOpen,
    statusDone,
  }
}
