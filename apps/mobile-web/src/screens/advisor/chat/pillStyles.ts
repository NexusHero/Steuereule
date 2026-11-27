import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'
import { controlLine } from '@steuereule/ui'

/** The toggle pill of the chat composer (skills, turbo) in its off and on state. */
export function pillStyles(t: UiTheme) {
  return {
    pill: {
      minHeight: 32,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: controlLine(t),
      backgroundColor: t.color.karte,
      justifyContent: 'center',
    } as ViewStyle,
    pillOn: { borderColor: t.color.tinte, backgroundColor: t.color.funkeWeich } as ViewStyle,
    label: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    labelOn: { color: t.color.tinte } as TextStyle,
  }
}
