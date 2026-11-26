import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'
import { appbarStyles } from '../shared/screenStyles'

export function makePrivacyStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const heroKicker: TextStyle = { ...t.type.meta, color: t.color.funkeHell, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const heroHeading: TextStyle = { ...t.type.headline, color: t.color.nachtText, marginTop: t.space.s2, marginBottom: t.space.s2 }
  const heroBody: TextStyle = { ...t.type.small, color: t.color.nachtText, opacity: 0.85 }
  const centerBlock: ViewStyle = { alignItems: 'center', justifyContent: 'center', paddingVertical: t.space.s6, gap: t.space.s3 }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, textAlign: 'center' }
  const sectionTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s4 }
  const exportSpacer: ViewStyle = { marginBottom: t.space.s4 }
  const hint: TextStyle = { ...t.type.caption, color: t.color.tinte2, marginTop: t.space.s2 }
  const successNote: TextStyle = { ...t.type.small, color: t.color.tinte, marginTop: t.space.s2 }
  const errorNote: TextStyle = { ...t.type.small, color: t.color.fehler, marginTop: t.space.s2 }
  const dangerLabel: TextStyle = { ...t.type.button, color: t.color.fehler }
  const offerHeading: TextStyle = { ...t.type.button, color: t.color.tinte, marginTop: t.space.s2, marginBottom: t.space.s2 }
  const warningBody: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s3 }
  const buttonSpacer: ViewStyle = { marginTop: t.space.s3 }

  return {
    screen,
    wideScreen,
    ...appbarStyles(t),
    heroKicker,
    heroHeading,
    heroBody,
    centerBlock,
    help,
    sectionTitle,
    sectionBody,
    exportSpacer,
    hint,
    successNote,
    errorNote,
    dangerLabel,
    offerHeading,
    warningBody,
    buttonSpacer,
  }
}
