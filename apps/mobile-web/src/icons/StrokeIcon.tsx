import { Path, Svg } from 'react-native-svg'

/**
 * The owl screen's line icons: one 24-unit grid, round caps, drawn in the current ink. A name
 * picks the paths, so a screen never ships its own copy of a glyph.
 */
export const STROKE_ICON_PATHS = {
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M20 20l-4-4'],
  plus: ['M12 5v14', 'M5 12h14'],
  lock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'],
  settings: ['M4 6h9', 'M19 6h1', 'M4 12h3', 'M13 12h7', 'M4 18h11', 'M21 18h-1', 'M16 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z', 'M10 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z', 'M18 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z'],
  sidebar: ['M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', 'M9 4v16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z'],
  document: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  calculator: ['M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 7h6', 'M9 12h1', 'M14 12h1', 'M9 16h1', 'M14 16h1'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19V5'],
  compare: ['M7 4v16', 'M17 4v16', 'M3 8h8', 'M13 16h8'],
  question: ['M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14', 'M12 18h.01'],
  note: ['M5 4h14v12l-4 4H5z', 'M15 20v-4h4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  draft: ['M12 20h8', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  check: ['M5 12l5 5 9-10'],
  status: ['M12 7v5l3 2', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z'],
} as const

export type StrokeIconName = keyof typeof STROKE_ICON_PATHS

export interface StrokeIconProps {
  readonly name: StrokeIconName
  readonly size?: number | undefined
  readonly color: string
  readonly strokeWidth?: number | undefined
}

export function StrokeIcon({ name, size = 20, color, strokeWidth = 2 }: StrokeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {STROKE_ICON_PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  )
}
