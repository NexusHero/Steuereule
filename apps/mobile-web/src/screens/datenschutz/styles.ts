// DatenschutzScreen's styles — shared by the screen and its extracted sections (ExportSection,
// DeleteSection), which each used to re-read the same style keys off the screen's single
// `makeStyles`. One factory here, imported everywhere, so a section's own file stays about what
// it renders rather than re-listing the screen's whole style map.
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeDatenschutzStyles(t: UiTheme) {
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
  const heroKicker: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.funkeHell, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const heroHeading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], color: t.color.nachtText, marginTop: t.space.s2, marginBottom: t.space.s2, lineHeight: t.size['2xl'] * 1.1 }
  const heroBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.nachtText, opacity: 0.85 }
  const centerBlock: ViewStyle = { alignItems: 'center', justifyContent: 'center', paddingVertical: t.space.s6, gap: t.space.s3 }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center' }
  const sectionTitle: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s4 }
  const exportRow: ViewStyle = { marginBottom: t.space.s4 }
  const hint: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s2 }
  const successNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, marginTop: t.space.s2 }
  const errorNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler, marginTop: t.space.s2 }
  const dangerLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.fehler }
  const offerHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginTop: t.space.s2, marginBottom: t.space.s2 }
  const warningBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s3 }
  const buttonSpacer: ViewStyle = { marginTop: t.space.s3 }

  return {
    screen,
    wideScreen,
    appbar,
    backButton,
    backGlyph,
    appbarTitle,
    heroKicker,
    heroHeading,
    heroBody,
    centerBlock,
    help,
    sectionTitle,
    sectionBody,
    exportRow,
    hint,
    successNote,
    errorNote,
    dangerLabel,
    offerHeading,
    warningBody,
    buttonSpacer,
  }
}
