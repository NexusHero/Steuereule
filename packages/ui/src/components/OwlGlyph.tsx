import { View, type ViewStyle, type StyleProp } from 'react-native'

export interface OwlGlyphProps {
  /** Edge length in px; the geometry scales from a 16px master. */
  readonly size?: number
  /** Ink of head, ears and pupils. */
  readonly ink: string
  /** Fill of the glasses — the surface the glyph sits on. */
  readonly ground: string
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

/**
 * The advisor owl at chip size — the AI sender mark that replaces the old round "B" dot.
 * Built from plain Views (no react-native-svg in @steuereule/ui) after the brand mark's geometry:
 * two ears, a rounded head, two glasses. Decorative: the surrounding chip carries the label.
 * Inside AI surfaces in ki-tinte on ki-weich; as the Eule tab icon in the tab bar's ink.
 * Never violet outside AI surfaces — the brand OwlMark stays lime/ink.
 */
export function OwlGlyph({ size = 16, ink, ground, style, testID = 'owl-glyph' }: OwlGlyphProps) {
  const u = size / 16
  const ear = (side: 'left' | 'right'): ViewStyle => ({
    position: 'absolute',
    top: 0,
    [side]: 2 * u,
    width: 0,
    height: 0,
    borderLeftWidth: 2.5 * u,
    borderRightWidth: 2.5 * u,
    borderBottomWidth: 5 * u,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: ink,
  })
  const head: ViewStyle = {
    position: 'absolute',
    left: 1.5 * u,
    top: 3 * u,
    width: 13 * u,
    height: 12.5 * u,
    borderRadius: 6 * u,
    backgroundColor: ink,
  }
  const eye = (left: number): ViewStyle => ({
    position: 'absolute',
    left: left * u,
    top: 6 * u,
    width: 5 * u,
    height: 5 * u,
    borderRadius: 2.5 * u,
    backgroundColor: ground,
    alignItems: 'center',
    justifyContent: 'center',
  })
  const pupil: ViewStyle = { width: 2 * u, height: 2 * u, borderRadius: u, backgroundColor: ink }

  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, style]}
    >
      <View style={ear('left')} />
      <View style={ear('right')} />
      <View style={head} />
      <View style={eye(3)}>
        <View style={pupil} />
      </View>
      <View style={eye(8)}>
        <View style={pupil} />
      </View>
    </View>
  )
}
