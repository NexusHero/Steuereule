import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, inkOnFunke, type UiTheme } from '@steuereule/ui'

export function makeLoginStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = {
    ...screen,
    maxWidth: WIDE_CONTENT_MAX_WIDTH,
  }
  const wideRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.s6,
    justifyContent: 'center',
    width: '100%',
  }
  const formColumn: ViewStyle = { width: '100%', maxWidth: 460, flexShrink: 1 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const guestNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: inkOnFunke(t) }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const outageBanner: ViewStyle = {
    backgroundColor: t.color.fehlerWeich,
    borderWidth: 2,
    borderColor: t.color.fehler,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const outageHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const outageBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }

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
