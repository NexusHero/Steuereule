// The step indicator (dashed progress bar, `role="progressbar"`) Onboarding and Interview both
// draw — one component, not two copies (Phase 0.3: screens stop re-typing the same pieces).
//
// React-Native-Web forwards a step indicator's ARIA min/max/now from the flat legacy
// `accessibilityValueMin/Max/Now` props, not from RN's `accessibilityValue` object (verified
// against react-native-web's forwardedProps/createDOMProps — the object form is silently
// dropped). Contained to this one cast so neither host screen stays on a divergent API.
import { View, type ViewStyle, type ViewProps } from 'react-native'
import { useTheme, type UiTheme } from '@steuereule/ui'

interface StepIndicatorProps {
  readonly step: number
  readonly total: number
}

type WebProgressAria = Pick<ViewProps, never>

export function StepIndicator({ step, total }: StepIndicatorProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const ariaProps = {
    accessibilityValueMin: 1,
    accessibilityValueMax: total,
    accessibilityValueNow: step + 1,
  } as unknown as WebProgressAria

  return (
    <View accessibilityRole="progressbar" style={styles.progressRow} {...ariaProps}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.segment, i <= step ? styles.segmentFilled : null]} />
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const progressRow: ViewStyle = { flexDirection: 'row', gap: t.space.s1, flex: 1 }
  const segment: ViewStyle = {
    flex: 1,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
  }
  const segmentFilled: ViewStyle = { backgroundColor: t.color.funke }
  return { progressRow, segment, segmentFilled }
}
