// Draws a design-system tab icon. The stroke paths come from `TAB_ICON_PATHS` in
// @steuereule/ui, which keeps the design system as their source of truth; the SVG runtime
// lives here, in the app, because the UI package deliberately carries no SVG dependency.
//
// Geometry matches the DS reference (.fk-tab svg): 22×22 on a 24-unit viewBox, 2.2 stroke,
// round caps and joins, no fill. `currentColor` has no equivalent in react-native-svg, so
// the colour is passed in — the tab bar's active/inactive colours are the caller's concern.
import { Svg, Path } from 'react-native-svg'

export interface TabIconProps {
  readonly path: string
  readonly color: string
}

export function TabIcon({ path, color }: TabIconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
