import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'

/** Back-button row, title and help text every form screen opens with. */
export function screenHeaderStyles(t: UiTheme) {
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s4 }
  return { headerRow, heading, help }
}

/** A numeric input with the "unclear" button beside it. */
export function unclearableFieldStyles(t: UiTheme) {
  const fieldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unclearButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    borderRadius: t.radius.s,
  }
  const unclearLabel: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const unclearActive: TextStyle = { ...t.type.label, color: t.color.tinte }
  return { feldRow: fieldRow, unklarButton: unclearButton, unklarLabel: unclearLabel, unklarActive: unclearActive }
}

/** App bar of a settings screen: round back button and the screen title beside it. */
export function appbarStyles(t: UiTheme) {
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
  return { appbar, backButton, backGlyph, appbarTitle }
}
