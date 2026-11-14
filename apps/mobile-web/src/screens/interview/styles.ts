import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeInterviewStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const gateScreen: ViewStyle = { ...screen, paddingTop: t.space.s6 }
  const wideGateScreen: ViewStyle = { ...wideScreen, paddingTop: t.space.s6 }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s5 }
  const stepPill: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.linieWeich,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingHorizontal: 12,
  }
  const stepPillText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const gateHeading: TextStyle = { ...heading, marginBottom: t.space.s3 }
  // "Funke ruhig": the key word is set in readable dark lime, no lime box behind it.
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    marginBottom: t.space.s3,
  }
  const gateBackLink: ViewStyle = { alignSelf: 'center', marginTop: t.space.s3, minHeight: 44, justifyContent: 'center' }
  const gateBackLinkText: TextStyle = { ...t.type.small, color: t.color.tinte, textDecorationLine: 'underline' }

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
