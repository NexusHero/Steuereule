// SteuerEule brand mark (F: splash.html `.fx-marke` — head/ears, glasses, eyelids), rebuilt with
// react-native-svg so it works native + web. Split into three stacked layers matching the DS
// reference's group structure so a consuming screen (SplashScreen) can drive each one with an
// independent `Animated.Value` for the self-draw entrance — this component stays presentational
// and renders the full, static mark when no layer styles are given.
//
// The three layer wrappers MUST be `Animated.View`, not plain `View` (steuereule#133 real-browser
// finding): a live `Animated.Value` handed to a non-animated host component never resolves — on
// react-native-web it freezes the style at whatever the value object itself stringifies to
// (`scaleY([object Object])`, effectively `none`) for the component's whole lifetime, and never
// updates when the value changes, because plain `View` never subscribes to it. Only
// `Animated.View` subscribes and pushes the live, resolved value to the DOM/native node on every
// frame — see OwlMark.test.tsx's "resolves a live Animated.Value" case for the regression proof.
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native'
import { Svg, Path, Rect, Circle } from 'react-native-svg'
import { useTheme } from '@steuereule/ui'

export interface OwlMarkProps {
  readonly size?: number
  readonly headStyle?: StyleProp<ViewStyle>
  readonly glassesStyle?: StyleProp<ViewStyle>
  readonly lidStyle?: StyleProp<ViewStyle>
}

const VIEWBOX = '0 0 96 96'

export function OwlMark({ size = 104, headStyle, glassesStyle, lidStyle }: OwlMarkProps) {
  const t = useTheme()
  const layer: ViewStyle = { position: 'absolute', width: size, height: size }
  // DS reference (splash.html `.au-lid`): rest state is `scaleY(0)` anchored `center top` — the
  // eyelid rect collapses to nothing from its top edge, so at rest the eyes render OPEN. A
  // consumer (SplashScreen) overrides this with an animated `lidStyle` to play a blink
  // (scaleY 0 -> 1 -> 0); with no `lidStyle` at all the mark must still show open eyes, never the
  // green lids fully covering the pupils.
  const lidRestStyle: ViewStyle = { transform: [{ scaleY: 0 }], transformOrigin: 'center top' }

  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {/* au-kopf: head, ears, beak */}
      <Animated.View style={[layer, headStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Path d="M20 36 L30 10 L41 24 Z" fill={t.color.funke} />
          <Path d="M76 36 L66 10 L55 24 Z" fill={t.color.funke} />
          <Rect x={14} y={20} width={68} height={64} rx={30} fill={t.color.funke} />
          <Path d="M48 58 L55 65 L48 74 L41 65 Z" fill={t.color.nacht} />
        </Svg>
      </Animated.View>

      {/* au-brille: glasses frame + pupils */}
      <Animated.View style={[layer, glassesStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Rect x={42} y={44} width={12} height={6} rx={3} fill={t.color.nacht} />
          <Circle cx={33} cy={47} r={14} fill={t.color.nacht} />
          <Circle cx={63} cy={47} r={14} fill={t.color.nacht} />
          <Circle cx={36} cy={45} r={5.5} fill={t.color.funke} />
          <Circle cx={66} cy={45} r={5.5} fill={t.color.funke} />
        </Svg>
      </Animated.View>

      {/* au-lid: eyelids, drawn last so they sit on top of the pupils. Anchored top so a scaleY
          animation hinges from the top edge like a real eyelid, matching the DS reference. */}
      <Animated.View style={[layer, lidRestStyle, lidStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Rect x={19} y={33} width={28} height={28} rx={14} fill={t.color.funke} />
          <Rect x={49} y={33} width={28} height={28} rx={14} fill={t.color.funke} />
        </Svg>
      </Animated.View>
    </View>
  )
}
