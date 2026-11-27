import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'
import { appbarStyles } from '../shared/screenStyles'

export function makeSecurityStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const statusRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }
  const sectionTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s4 }
  // On the dark status card the light-surface ink would be unreadable (ink on near-black).
  const nachtTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s2 }
  const nachtBody: TextStyle = { ...t.type.small, color: t.color.tinte }
  const status: TextStyle = { ...t.type.small, color: t.color.tinte, marginTop: t.space.s2 }
  const secret: TextStyle = { ...t.type.meta, color: t.color.tinte2, marginTop: t.space.s3, marginBottom: t.space.s3 }
  const codes: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, marginBottom: t.space.s4 }
  const card: ViewStyle = { marginTop: t.space.s4 }
  const qrRow: ViewStyle = { alignItems: 'center', justifyContent: 'center', marginVertical: t.space.s3 }

  return {
    screen,
    wideScreen,
    ...appbarStyles(t),
    statusRow,
    sectionTitle,
    sectionBody,
    nachtTitle,
    nachtBody,
    status,
    secret,
    codes,
    card,
    qrRow,
  }
}
