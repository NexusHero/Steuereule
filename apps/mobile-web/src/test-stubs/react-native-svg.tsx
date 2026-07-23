// Test-only stub for react-native-svg (its published source is Flow-typed and can't be parsed by
// the jsdom/vitest transform). The real package is used by Metro/Expo and by typecheck; here the
// SVG marks are static visuals, so passthrough Views are enough to render the screens under test.
import { View } from 'react-native'
import { type ReactNode } from 'react'

type AnyProps = { readonly children?: ReactNode } & Record<string, unknown>

export function Svg({ children }: AnyProps) {
  return <View>{children}</View>
}
export function Path(_: AnyProps) {
  return <View />
}
export type SvgProps = AnyProps
