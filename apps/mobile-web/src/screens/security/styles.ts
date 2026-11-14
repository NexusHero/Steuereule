import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeSecurityStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const appbar: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s4 }
  const backButton: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: t.radius.pille,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte2,
    backgroundColor: t.color.karte,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const backGlyph: TextStyle = { ...t.type.emphasis, color: t.color.tinte }
  const appbarTitle: TextStyle = { ...t.type.title, color: t.color.tinte, flex: 1 }
  const statusRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }
  const sectionTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s4 }
  const status: TextStyle = { ...t.type.small, color: t.color.tinte, marginTop: t.space.s2 }
  const secret: TextStyle = { ...t.type.meta, color: t.color.tinte2, marginTop: t.space.s3, marginBottom: t.space.s3 }
  const codes: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, marginBottom: t.space.s4 }
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
