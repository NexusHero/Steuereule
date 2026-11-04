import { useMemo } from 'react'
import { View } from 'react-native'
import { Svg, Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'
import { useTheme } from '@steuereule/ui'
import { OwlMark } from './OwlMark'

export interface QrMarkProps {
  readonly value: string
  readonly size?: number
  readonly accessibilityLabel: string
  readonly brandMark?: boolean
}

export function QrMark({ value, size = 168, accessibilityLabel, brandMark = false }: QrMarkProps) {
  const t = useTheme()

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
  const markSize = Math.round(size * 0.14)
  const markInset = (size - markSize) / 2
  const QUIET_ZONE_MODULES = 4
  const quietZonePx = cell * QUIET_ZONE_MODULES

  return (
    <View
      testID="qr-mark-quiet-zone"
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
            testID="qr-mark-brand-mark"
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
