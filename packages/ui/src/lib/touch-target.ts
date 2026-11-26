import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

/**
 * The component's minimum touch-target height, which a caller may raise but never lower.
 * Returned as a trailing style so it wins over the caller's `style` (#178).
 */
export function minTouchHeight(callerStyle: StyleProp<ViewStyle>, floor: number): ViewStyle {
  const requested = StyleSheet.flatten(callerStyle)?.minHeight
  return { minHeight: typeof requested === 'number' ? Math.max(floor, requested) : floor }
}
