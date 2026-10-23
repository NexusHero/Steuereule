// ProfilScreen's styles — shared by the screen's extracted ProfilView and ProfilEdit so each file
// stays about what it renders. The loading/error states' centred styles live in
// ../shared/ScreenState.tsx (Phase 0.3 AC-3).
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeProfilStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
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
    borderWidth: 2,
    borderColor: t.color.tinte,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const avatarText: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
  }
  const name: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.funke }
  const idLine: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.s,
    color: t.color.nachtText,
    opacity: 0.8,
    fontVariant: ['tabular-nums'],
    marginTop: t.space.s1,
  }
  const savedNotice: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    textAlign: 'center',
    marginTop: t.space.s3,
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: -t.space.s2, marginBottom: t.space.s3 }
  const saveErrorText: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const datenCard: ViewStyle = { padding: 0, overflow: 'hidden' }
  const datenRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: t.space.s4,
    paddingVertical: t.space.s3,
  }
  const datenRowLabel: TextStyle = { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte, flex: 1 }
  const datenRowArrow: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, color: t.color.tinte }

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
    datenCard,
    datenRow,
    datenRowLabel,
    datenRowArrow,
  }
}
