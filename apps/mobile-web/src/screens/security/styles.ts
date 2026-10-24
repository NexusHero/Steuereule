// SicherheitScreen's styles (REQ-007). One factory, mirroring the Datenschutz/Profil
// pattern of a single `make*Styles` imported by the screen rather than inlined styles.
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeSicherheitStyles(t: UiTheme) {
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
  const appbar: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s4 }
  const backButton: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: t.radius.pille,
    borderWidth: 2,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadow.hartS,
  }
  const backGlyph: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte }
  const appbarTitle: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], color: t.color.tinte, flex: 1 }
  const statusRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }
  const sectionTitle: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s4 }
  const status: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, marginTop: t.space.s2 }
  const secret: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s3, marginBottom: t.space.s3 }
  const codes: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.s, color: t.color.tinte, marginBottom: t.space.s4 }
  const card: ViewStyle = { marginTop: t.space.s4 }

  return {
    screen,
    wideScreen,
    appbar,
    backButton,
    backGlyph,
    appbarTitle,
    statusRow,
    sectionTitle,
    sectionBody,
    status,
    secret,
    codes,
    card,
  }
}
