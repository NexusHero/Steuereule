// The round back button (a `←` glyph in a bordered circle) Onboarding and Interview both render
// as their step-header's way out — one component instead of the same `backButton`/`backArrow`
// styles and `Pressable` re-typed per screen (Phase 0.3). Datenschutz's Appbar deliberately does
// NOT use this: its back button sits in an appbar row next to a title, not in a step header.
import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTheme, type UiTheme } from '@steuereule/ui'

interface BackButtonProps {
  /** Translated label for the screen-reader announcement (ADR-0006: words stay in i18n). */
  readonly accessibilityLabel: string
  readonly onPress: () => void
}

export function BackButton({ accessibilityLabel, onPress }: BackButtonProps) {
  const t = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={makeStyles(t).backButton}>
      <Text style={makeStyles(t).backArrow}>←</Text>
    </Pressable>
  )
}

/** The empty 44×44 spacer that keeps the step header balanced when there is no back button
 *  (step 0 / the first question) — the same dimensions as BackButton, so the header never jumps. */
export function BackButtonSpacer() {
  return <View style={{ width: 44, height: 44 }} />
}

function makeStyles(t: UiTheme) {
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
  const backArrow: TextStyle = { fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  return { backButton, backArrow }
}
