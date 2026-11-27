// Styles of the Glas-Erklärung preview and its sections.
import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'
import { controlLine } from '@steuereule/ui'

export function makeStyles(t: UiTheme) {
  const collapsedCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    padding: t.space.s3,
  }
  const collapsedHeader: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const collapsedTitle: TextStyle = {
    ...t.type.itemTitle,
    color: t.color.tinte,
  }
  const collapsedSubtitle: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginTop: 2,
  }
  const container: ViewStyle = {
    marginBottom: t.space.s4,
    gap: t.space.s3,
  }
  // A real basis width: with `flex: 1` (basis 0) the row never wraps and the title shrinks to one letter per line.
  const titleColumn: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 }
  const headerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const heading: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const subheading: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginTop: 2,
  }
  const toggleButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderRadius: t.radius.pille,
    borderWidth: t.space.kontur,
    borderColor: controlLine(t),
    backgroundColor: t.color.karte,
  }
  const toggleButtonText: TextStyle = {
    ...t.type.label,
    color: t.color.tinte,
  }
  const filterRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s2,
    maxWidth: '100%',
    flexShrink: 1,
  }
  const sectionCard: ViewStyle = {
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    padding: t.space.s3,
  }
  const sectionHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const sectionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    flex: 1,
  }
  const sectionCount: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  const sectionSubtitle: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginBottom: t.space.s3,
  }
  const rowList: ViewStyle = {
    gap: t.space.s2,
  }
  const rowItem: ViewStyle = {
    padding: t.space.s2,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.linieWeich,
    backgroundColor: t.color.grund,
    gap: 4,
  }
  const rowTop: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const linePill: ViewStyle = {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funkeWeich,
  }
  const linePillText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte,
    fontWeight: '700',
  }
  const personPill: ViewStyle = {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: t.radius.pille,
    borderWidth: 1,
    borderColor: t.color.linie,
  }
  const personPillText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  const provenanceBadge: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
    marginLeft: 'auto',
  }
  const rowMain: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const rowLabel: TextStyle = {
    ...t.type.body,
    color: t.color.tinte,
    flex: 1,
  }
  const rowValue: TextStyle = {
    ...t.type.bodyStrong,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const jumpHint: TextStyle = {
    ...t.type.meta,
    color: t.color.funkeTinte,
  }

  return {
    collapsedCard,
    collapsedHeader,
    collapsedTitle,
    collapsedSubtitle,
    container,
    headerRow,
    titleColumn,
    heading,
    subheading,
    toggleButton,
    toggleButtonText,
    filterRow,
    sectionCard,
    sectionHeader,
    sectionTitle,
    sectionCount,
    sectionSubtitle,
    rowList,
    rowItem,
    rowTop,
    linePill,
    linePillText,
    personPill,
    personPillText,
    provenanceBadge,
    rowMain,
    rowLabel,
    rowValue,
    jumpHint,
  }
}
