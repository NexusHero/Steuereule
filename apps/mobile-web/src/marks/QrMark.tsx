// Renders a scannable QR code from a URL — #238's Login QR column. `qrcode-generator` is a
// small, dependency-free, pure-JS encoder (no rendering of its own); this component draws its
// module matrix with `react-native-svg` `Rect`s, the exact same rendering technology already
// proven to work cross-platform in this app for `OwlMark` — no new rendering approach, no new
// native dependency, nothing Metro/Vitest haven't already had to resolve for this app.
import { useMemo } from 'react'
import { Svg, Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'
import { useTheme } from '@steuereule/ui'

export interface QrMarkProps {
  readonly value: string
  readonly size?: number
  /** Accessible description — the phone-camera flow this exists for has nothing else to read. */
  readonly accessibilityLabel: string
}

export function QrMark({ value, size = 168, accessibilityLabel }: QrMarkProps) {
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

  return (
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
  )
}
