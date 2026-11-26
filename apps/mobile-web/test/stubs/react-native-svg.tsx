// Test-only stub for react-native-svg (its published source is Flow-typed and can't be parsed by
// the jsdom/vitest transform). The real package is used by Metro/Expo and by typecheck; here the
// SVG marks are static visuals, so passthrough Views are enough to render the screens under test.
//
// Forwards `accessibilityRole`/`accessibilityLabel`/`testID` (real RN-Web View props, faithfully
// translated to `role`/`aria-label`/`data-testid`) — not the SVG-specific geometry props
// (`viewBox`/`x`/`fill`/…), which `View` doesn't understand and would warn about. QrMark (#238)
// is the first consumer whose accessible label is meaningful content rather than a decorative
// mark hidden from screen readers (OwlMark's own wrapper already sets `accessible={false}` one
// level up), so it is the first thing here that actually needs this to reach the DOM.
import { Text as RnText, View, type AccessibilityRole } from 'react-native'
import { type ReactNode } from 'react'

type AnyProps = {
  readonly children?: ReactNode
  readonly accessibilityRole?: AccessibilityRole
  readonly accessibilityLabel?: string
  readonly testID?: string
} & Record<string, unknown>

function passthroughProps({ accessibilityRole, accessibilityLabel, testID }: AnyProps) {
  return { accessibilityRole, accessibilityLabel, testID }
}

export function Svg({ children, ...rest }: AnyProps) {
  return <View {...passthroughProps(rest)}>{children}</View>
}
export function Path(props: AnyProps) {
  return <View {...passthroughProps(props)} />
}
export function Rect(props: AnyProps) {
  return <View {...passthroughProps(props)} />
}
export function Circle(props: AnyProps) {
  return <View {...passthroughProps(props)} />
}
export function Line(props: AnyProps) {
  return <View {...passthroughProps(props)} />
}
export function Polyline(props: AnyProps) {
  return <View {...passthroughProps(props)} />
}
// Groups and definitions keep their children; a pattern is paint, not content, so it renders nothing.
export function G({ children, ...rest }: AnyProps) {
  return <View {...passthroughProps(rest)}>{children}</View>
}
export function Defs(_props: AnyProps) {
  return null
}
export function Pattern(_props: AnyProps) {
  return null
}
// Chart labels are text: a real Text, so a string child never lands bare inside a View.
export function Text({ children, ...rest }: AnyProps) {
  return <RnText {...passthroughProps(rest)}>{children}</RnText>
}
export type SvgProps = AnyProps
