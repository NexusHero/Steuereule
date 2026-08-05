// Renders a scannable QR code from a URL — #238's Login QR column. `qrcode-generator` is a
// small, dependency-free, pure-JS encoder (no rendering of its own); this component draws its
// module matrix with `react-native-svg` `Rect`s, the exact same rendering technology already
// proven to work cross-platform in this app for `OwlMark` — no new rendering approach, no new
// native dependency, nothing Metro/Vitest haven't already had to resolve for this app.
import { useMemo } from 'react'
import { View } from 'react-native'
import { Svg, Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'
import { useTheme } from '@steuereule/ui'
import { OwlMark } from './OwlMark'

export interface QrMarkProps {
  readonly value: string
  readonly size?: number
  /** Accessible description — the phone-camera flow this exists for has nothing else to read. */
  readonly accessibilityLabel: string
  /** #283/C3 — `AuthGeraete.jsx` puts the brand mark inside the QR pattern's own centre
   *  (`:25-27`), not above the card as a separate element (the dropped owl this replaces).
   *  'M' error correction tolerates ~15% obscured area; the mark here stays well under that.
   *  A plain sibling of the `Svg`, not one of its children — `qr-mark`'s own child count (what
   *  QrMark.test.tsx pins down) is unaffected by this. */
  readonly brandMark?: boolean
}

export function QrMark({ value, size = 168, accessibilityLabel, brandMark = false }: QrMarkProps) {
  const t = useTheme()

  // Type 0 = automatic sizing (the encoder picks the smallest QR version that fits `value`);
  // 'M' (15% error-correction) is the standard default for a code meant to be read by an
  // arbitrary phone camera, not a printed poster needing to survive damage.
  const modules = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    const dark: Array<{ row: number; col: number }> = []
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) dark.push({ row, col })
      }
    }
    return { count, dark }
  }, [value])

  const cell = size / modules.count
  const markSize = Math.round(size * 0.22)
  const markInset = (size - markSize) / 2
  // #298 review, F5(b) — the quiet zone. ISO/IEC 18004 §5.3.2 requires a light margin of at
  // least 4 modules around the whole symbol: a scanner's finder-pattern search relies on the
  // 1:1:3:1:1 dark/light ratio ENDING somewhere light, and without a margin the pattern runs
  // straight into whatever sits outside it. `QrMark` always painted its own white background
  // exactly `size × size` with nothing beyond it, so this was never actually at risk until #283/
  // C3 put the card itself on a dark (`nacht`) surface — before that, the surrounding card was
  // light too, and the quiet zone existed by accident of context rather than by the component's
  // own construction. Reserved here, unconditionally, rather than left to whatever background
  // happens to be light: a component that's only scannable on some of its call sites is a latent
  // bug waiting for the next dark surface it gets dropped onto.
  const QUIET_ZONE_MODULES = 4
  const quietZonePx = cell * QUIET_ZONE_MODULES

  return (
    <View
      style={{
        width: size + quietZonePx * 2,
        height: size + quietZonePx * 2,
        padding: quietZonePx,
        backgroundColor: t.color.karte,
        borderRadius: t.radius.s,
      }}
    >
      <View style={{ width: size, height: size }}>
        <Svg
          testID="qr-mark"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
        >
          <Rect x={0} y={0} width={size} height={size} fill={t.color.karte} />
          {modules.dark.map(({ row, col }) => (
            <Rect key={`${row}-${col}`} x={col * cell} y={row * cell} width={cell} height={cell} fill={t.color.tinte} />
          ))}
        </Svg>
        {brandMark ? (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              top: markInset,
              left: markInset,
              width: markSize,
              height: markSize,
              borderRadius: t.radius.s,
              backgroundColor: t.color.karte,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <OwlMark size={markSize * 0.72} />
          </View>
        ) : null}
      </View>
    </View>
  )
}
