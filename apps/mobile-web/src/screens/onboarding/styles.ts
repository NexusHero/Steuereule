// OnboardingScreen's styles — shared by the step-form screen and its extracted OnboardingSummary
// so each file stays about what it renders rather than re-listing the whole style map. The
// loading/error states' own centred styles live in ../shared/ScreenState.tsx (Phase 0.3 AC-3).
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeOnboardingStyles(t: UiTheme) {
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
  const headerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s3,
    paddingBottom: t.space.s5,
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
    textAlign: 'center',
  }
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s5,
    textAlign: 'center',
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const submitError: TextStyle = {
    color: t.color.fehler,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    marginTop: t.space.s3,
  }
  const summaryHeadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s2 }
  const summaryHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
  }
  const cardLabel: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
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
  const summaryRowLabel: TextStyle = { color: t.color.nachtText, opacity: 0.7, fontFamily: t.font.text, fontSize: t.size.s }
  const summaryRowValue: TextStyle = { color: t.color.funke, fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s }
  const summaryRowValueMono: TextStyle = { fontFamily: t.font.mono, fontVariant: ['tabular-nums'] }
  const summaryEditButton: ViewStyle = { marginTop: t.space.s2 }
  const summaryFooterNote: TextStyle = { fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }

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
