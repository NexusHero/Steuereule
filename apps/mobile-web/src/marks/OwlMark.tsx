import { Animated, View, type StyleProp, type ViewStyle } from 'react-native'
import { Svg, Path, Rect, Circle } from 'react-native-svg'
import { useTheme } from '@steuereule/ui'

export interface OwlMarkProps {
  readonly size?: number
  /**
   * 'funke' (default) = lime owl for nacht grounds (splash, QR) — assets/marke-funke.svg.
   * 'tinte' = ink owl with lime-rimmed glasses for light grounds (login) — assets/marke-tinte.svg;
   * follows the theme, so in "dunkel" the ink owl turns light on the dark ground.
   */
  readonly variant?: 'funke' | 'tinte'
  readonly headStyle?: StyleProp<ViewStyle>
  readonly glassesStyle?: StyleProp<ViewStyle>
  readonly lidStyle?: StyleProp<ViewStyle>
}

const VIEWBOX = '0 0 96 96'

export function OwlMark({ size = 104, variant = 'funke', headStyle, glassesStyle, lidStyle }: OwlMarkProps) {
  const t = useTheme()
  const layer: ViewStyle = { position: 'absolute', width: size, height: size }
  const lidRestStyle: ViewStyle = { transform: [{ scaleY: 0 }], transformOrigin: 'center top' }
  const ink = variant === 'tinte'
  const head = ink ? t.color.tinte : t.color.funke

  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID={`owl-mark-${variant}`}
    >
      <Animated.View style={[layer, headStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Path d="M20 36 L30 10 L41 24 Z" fill={head} />
          <Path d="M76 36 L66 10 L55 24 Z" fill={head} />
          <Rect x={14} y={20} width={68} height={64} rx={30} fill={head} />
          <Path d="M48 58 L55 65 L48 74 L41 65 Z" fill={ink ? t.color.funke : t.color.nacht} />
        </Svg>
      </Animated.View>

      <Animated.View style={[layer, glassesStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          {ink ? (
            <>
              <Rect x={42} y={44} width={12} height={6} rx={3} fill={t.color.grund} />
              <Circle cx={33} cy={47} r={14} fill={t.color.grund} stroke={t.color.funke} strokeWidth={3.5} />
              <Circle cx={63} cy={47} r={14} fill={t.color.grund} stroke={t.color.funke} strokeWidth={3.5} />
              <Circle cx={36} cy={45} r={5.5} fill={t.color.tinte} />
              <Circle cx={66} cy={45} r={5.5} fill={t.color.tinte} />
            </>
          ) : (
            <>
              <Rect x={42} y={44} width={12} height={6} rx={3} fill={t.color.nacht} />
              <Circle cx={33} cy={47} r={14} fill={t.color.nacht} />
              <Circle cx={63} cy={47} r={14} fill={t.color.nacht} />
              <Circle cx={36} cy={45} r={5.5} fill={t.color.funke} />
              <Circle cx={66} cy={45} r={5.5} fill={t.color.funke} />
            </>
          )}
        </Svg>
      </Animated.View>

      <Animated.View style={[layer, lidRestStyle, lidStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Rect x={19} y={33} width={28} height={28} rx={14} fill={head} />
          <Rect x={49} y={33} width={28} height={28} rx={14} fill={head} />
        </Svg>
      </Animated.View>
    </View>
  )
}
