import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'

/** What the lists beside the chat (conversations, notes, context) look alike in: headings, help, links, errors. */
export function makeSidePanelStyles(t: UiTheme) {
  return {
    wrap: { gap: t.space.s3 } as ViewStyle,
    heading: { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte } as TextStyle,
    help: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    meta: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    link: { minHeight: 44, justifyContent: 'center' } as ViewStyle,
    linkText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte, textDecorationLine: 'underline' } as TextStyle,
    failed: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler } as TextStyle,
  }
}
