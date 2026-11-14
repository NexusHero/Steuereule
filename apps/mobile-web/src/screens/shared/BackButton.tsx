import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTheme, type UiTheme } from '@steuereule/ui'

interface BackButtonProps {
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly testID?: string
}

export function BackButton({ accessibilityLabel, onPress, testID }: BackButtonProps) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={makeStyles(t).backButton}
      {...(testID ? { testID } : {})}
    >
      <Text style={makeStyles(t).backArrow}>←</Text>
    </Pressable>
  )
}

export function BackButtonSpacer() {
  return <View style={{ width: 44, height: 44 }} />
}

function makeStyles(t: UiTheme) {
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
  const backArrow: TextStyle = { ...t.type.button, color: t.color.tinte }
  return { backButton, backArrow }
}
