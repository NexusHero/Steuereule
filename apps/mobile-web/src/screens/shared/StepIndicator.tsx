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
  // Quiet track: open steps are a soft line, done steps lime — no ink outlines.
  const segment: ViewStyle = {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.color.linieWeich,
  }
  const segmentFilled: ViewStyle = { backgroundColor: t.color.funke }
  return { progressRow, segment, segmentFilled }
}
