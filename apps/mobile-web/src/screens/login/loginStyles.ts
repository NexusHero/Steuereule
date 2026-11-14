import { type ViewStyle, type TextStyle } from 'react-native'
import { NARROW_CONTENT_MAX_WIDTH, inkOnFunke, type UiTheme } from '@steuereule/ui'

export function makeLoginStyles(t: UiTheme) {
  // Login on tablet/desktop sits form and device-QR side by side, so it takes the overview width.
  const screen: ViewStyle = { ...t.layout.overview.narrow, justifyContent: 'center' }
  const wideScreen: ViewStyle = { ...t.layout.overview.wide, justifyContent: 'center' }
  const wideRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.s6,
    justifyContent: 'center',
    width: '100%',
  }
  const formColumn: ViewStyle = { width: '100%', maxWidth: NARROW_CONTENT_MAX_WIDTH, flexShrink: 1 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { ...t.type.small, color: t.color.tinte }
  const guestNote: TextStyle = { ...t.type.caption, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { ...t.type.button, color: inkOnFunke(t) }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const outageBanner: ViewStyle = {
    backgroundColor: t.color.fehlerWeich,
    borderWidth: 2,
    borderColor: t.color.fehler,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const outageHeading: TextStyle = { ...t.type.button, color: t.color.tinte, marginBottom: t.space.s1 }
  const outageBody: TextStyle = { ...t.type.small, color: t.color.tinte2 }

  return {
    screen,
    wideScreen,
    wideRow,
    formColumn,
    linksRow,
    link,
    guestNote,
    submittingRow,
    submittingLabel,
    cta,
    outageBanner,
    outageHeading,
    outageBody,
  }
}
