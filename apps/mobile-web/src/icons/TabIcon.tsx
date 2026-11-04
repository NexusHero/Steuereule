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
