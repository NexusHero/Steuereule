import { type ViewStyle, type TextStyle } from 'react-native'
import { inkOnFunke, type UiTheme } from '@steuereule/ui'

export function makeProfileStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.overview.narrow
  const wideScreen: ViewStyle = t.layout.overview.wide
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s4,
    textAlign: 'center',
  }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const cancelButton: ViewStyle = { marginTop: t.space.s3 }
  const summaryCard: ViewStyle = { padding: t.space.s4 }
  const summaryRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const summaryTextCol: ViewStyle = { flex: 1, minWidth: 0 }
  const avatar: ViewStyle = {
    width: 54,
    height: 54,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funke,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const avatarText: TextStyle = {
    ...t.type.subhead,
    color: inkOnFunke(t),
  }
  const name: TextStyle = { ...t.type.emphasis, color: t.color.funke }
  const idLine: TextStyle = {
    ...t.type.metaLarge,
    color: t.color.nachtText,
    opacity: 0.8,
    fontVariant: ['tabular-nums'],
    marginTop: t.space.s1,
  }
  const savedNotice: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
    textAlign: 'center',
    marginTop: t.space.s3,
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: -t.space.s2, marginBottom: t.space.s3 }
  const saveErrorText: TextStyle = { ...t.type.small, color: t.color.fehler, marginTop: t.space.s2 }
  const dataCard: ViewStyle = { padding: 0, overflow: 'hidden' }
  const dataRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: t.space.s4,
    paddingVertical: t.space.s3,
  }
  const dataRowLabel: TextStyle = { ...t.type.body, color: t.color.tinte, flex: 1 }
  const dataRowArrow: TextStyle = { ...t.type.button, color: t.color.tinte }

  return {
    screen,
    wideScreen,
    heading,
    cta,
    cancelButton,
    summaryCard,
    summaryRow,
    summaryTextCol,
    avatar,
    avatarText,
    name,
    idLine,
    savedNotice,
    counterRow,
    saveErrorText,
    datenCard: dataCard,
    datenRow: dataRow,
    datenRowLabel: dataRowLabel,
    datenRowArrow: dataRowArrow,
  }
}
