import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeOnboardingStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s3,
    paddingBottom: t.space.s5,
  }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
    textAlign: 'center',
  }
  // "Funke ruhig": the key word is set in readable dark lime, no lime box behind it.
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    marginBottom: t.space.s5,
    textAlign: 'center',
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const submitError: TextStyle = {
    ...t.type.small,
    color: t.color.fehler,
    marginTop: t.space.s3,
  }
  const summaryHeadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s2 }
  const summaryHeading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
  }
  const cardLabel: TextStyle = {
    ...t.type.meta,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const summaryRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: t.space.s3,
    borderBottomWidth: 1.5,
    borderBottomColor: t.color.nachtKarte,
    paddingVertical: t.space.s2,
  }
  const summaryRowLabel: TextStyle = { ...t.type.small, color: t.color.nachtText, opacity: 0.7 }
  const summaryRowValue: TextStyle = { ...t.type.labelStrong, color: t.color.funke }
  const summaryRowValueMono: TextStyle = { fontFamily: t.type.figure.fontFamily, fontVariant: ['tabular-nums'] }
  const summaryEditButton: ViewStyle = { marginTop: t.space.s2 }
  const summaryFooterNote: TextStyle = { ...t.type.caption, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }

  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    mark,
    help,
    counterRow,
    cta,
    submitError,
    summaryHeadingRow,
    summaryHeading,
    cardLabel,
    summaryRow,
    summaryRowLabel,
    summaryRowValue,
    summaryRowValueMono,
    summaryEditButton,
    summaryFooterNote,
  }
}
