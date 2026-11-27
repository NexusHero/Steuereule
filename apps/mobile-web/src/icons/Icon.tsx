import { View } from 'react-native'
import { Path, Svg } from 'react-native-svg'
import { useTheme } from '@steuereule/ui'

/**
 * SteuerEule's own icon set (Graphit): line icons on a 24 px grid, 1.6 px stroke, round caps and
 * joins, drawn for this app. The owl stays the only filled mark; everything else is a line.
 *
 * One catalog, one component: a screen names an icon, it never carries a path. An icon beside its
 * word is decoration (hidden from assistive tech); an icon that stands alone needs `label`.
 */
export const ICON_PATHS = {
  // sign-in and fields
  mail: ['M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z', 'M3 7l9 6 9-6'],
  lock: ['M7 11h10a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z', 'M8 11V8a4 4 0 018 0v3'],
  info: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 11v5', 'M12 8h.01'],
  // what the money came from
  briefcase: ['M5 7h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z', 'M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2', 'M3 13h18'],
  laptop: ['M5.5 5h13A1.5 1.5 0 0120 6.5v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 14.5v-8A1.5 1.5 0 015.5 5z', 'M2 19h20'],
  layers: ['M12 3l9 5-9 5-9-5 9-5z', 'M3 13l9 5 9-5'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v5l3 2'],
  // the cockpit's ways in
  play: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M10 8.5l5 3.5-5 3.5v-7z'],
  list: ['M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z', 'M9 9h6', 'M9 13h6', 'M9 17h3'],
  assessment: ['M7 3h7l5 5v13H7V3z', 'M14 3v5h5', 'M9.5 14.5l2 2 3.5-4'],
  form: ['M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  coins: ['M9 4a5 5 0 100 10A5 5 0 009 4z', 'M14.5 10.2a5 5 0 11-4.3 4.3'],
  house: ['M4 11l8-7 8 7', 'M6 10v10h12V10', 'M10 20v-5h4v5'],
  child: ['M12 4a3 3 0 100 6 3 3 0 000-6z', 'M6 20a6 6 0 0112 0'],
  printer: ['M7 8V3h10v5', 'M6 8h12a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2z', 'M7 14h10v7H7v-7z'],
} as const

export type IconName = keyof typeof ICON_PATHS

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  /** Defaults to the theme's ink. */
  readonly color?: string
  /** Set when the icon stands alone; without it the icon is hidden from assistive tech. */
  readonly label?: string
  readonly testID?: string
}

export const ICON_STROKE = 1.6

export function Icon({ name, size = 20, color, label, testID }: IconProps) {
  const t = useTheme()
  const stroke = color ?? t.color.tinte
  // The wrapper carries the accessibility: react-native-svg does not pass ARIA through on every platform.
  const a11y = label === undefined ? { 'aria-hidden': true as const, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const } : { role: 'img' as const, 'aria-label': label }
  return (
    <View style={{ width: size, height: size }} {...a11y} {...(testID === undefined ? {} : { testID })}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {ICON_PATHS[name].map((d) => (
          <Path key={d} d={d} stroke={stroke} strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  )
}
