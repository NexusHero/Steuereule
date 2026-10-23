// InterviewScreen's styles — shared by the question and gate sub-screens so each file stays about
// what it renders. The loading/error states' centred styles live in ../shared/ScreenState.tsx,
// the back button in ../shared/BackButton.tsx and the progress bar in ../shared/StepIndicator.tsx
// (Phase 0.3: no per-screen re-typing).
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeInterviewStyles(t: UiTheme) {
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
  const gateScreen: ViewStyle = { ...screen, paddingTop: t.space.s6 }
  const wideGateScreen: ViewStyle = { ...gateScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s5 }
  const stepPill: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingHorizontal: 12,
  }
  const stepPillText: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const gateHeading: TextStyle = { ...heading, marginBottom: t.space.s3 }
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s3,
  }
  const gateBackLink: ViewStyle = { alignSelf: 'center', marginTop: t.space.s3, minHeight: 44, justifyContent: 'center' }
  const gateBackLinkText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline' }

  return {
    screen,
    wideScreen,
    gateScreen,
    wideGateScreen,
    headerRow,
    stepPill,
    stepPillText,
    heading,
    gateHeading,
    mark,
    help,
    gateBackLink,
    gateBackLinkText,
  }
}
