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
   *
   *  #298 review, F5(a)/(b) (Musti) — the size below is not a round number chosen for looks; it
   *  is the answer to a real measurement. Verified directly against this app's own encoder
   *  (`qrcode-generator`) for the actual URL shape this component renders in production
   *  (`.../device?user_code=…`, which resolves to a 33×33 module grid, RFC-level M-4): the
   *  earlier `0.22`-of-`size` box covered 81 of 1089 modules — 7.4%, not the ≈4.8% a naive
   *  "22% of the width" area estimate suggests, because a square doesn't align to the module
   *  grid and partially-covered modules still count as lost. At `0.14`, the same measurement
   *  gives 25/1089 — 2.3%. Both figures came from actually counting covered module cells, the
   *  same method Musti's own review used, not a fresh guess — and Musti's second pass
   *  independently re-derived the same 2.3% from this component's own rendered geometry
   *  (`size=144` → `markSize=20px`, `cell=4.364px`, 5×5 modules), confirming the value rather
   *  than just trusting it. This scales safely: box AREA is `size²` × the fraction SQUARED, so
   *  the *proportion* covered stays roughly constant regardless of how long a given
   *  `verificationUriComplete` happens to be (a longer URL means more, smaller modules, not a
   *  bigger box) — the module-grid-specific numbers above are this component's own measurement
   *  at its own real production URL shape, not a guess.
   *
   *  #298 review, F11(a) (Musti, second pass) — this doc used to say 2.3% "held with real margin
   *  below M-level's nominal ~15% budget", and that compared two different units: module AREA
   *  against codeword CORRECTION CAPACITY, which don't divide into each other — the exact
   *  area-vs-capacity mistake F5(a) itself caught in "22% of the width → ≈4.8%" above. Left as
   *  it was, the next reader could conclude "8% would still be under 15%, so it's fine" — which
   *  would be wrong. In the budget's own unit: at this grid (33×33, M-level, 2 blocks × 9
   *  correctable codewords = 18 correctable), 25 covered modules is roughly 3 codewords of area
   *  against 18 correctable — **about 17% of the actual budget**, not "2.3 of 15". The geometry
   *  fix stands; only that one sentence was wrong, corrected here rather than left to mislead the
   *  next measurement. That budget exists for real scan conditions — an angle, glare, a cheap
   *  sensor — not to be spent in advance by this component.
   *
   *  #298 review, F11(b) (Musti, second pass) — `0.14` is a deliberate departure from the DS
   *  reference, not an oversight worth flagging as a drift back to it: `AuthGeraete.jsx:24` sets
   *  the reference's own centre mark to `inset: '39%'` — 22% of the pattern width, this
   *  component's own original (also 7.4%-costing) starting value. The reference can spend that
   *  freely because its "QR" is decorative, never actually encoded (`an = (x*7 + y*13 +
   *  ((x*y)%5)) % 3 === 0` — a pattern function, not real `qrcode-generator` output) — there is
   *  no error-correction budget there to protect. This component's QR is real and has to be
   *  scanned, so it earns its own, smaller number instead of inheriting the reference's; this is
   *  the record of why, so a future DS-fidelity pass doesn't "fix" it back to 22%.
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
  // See this prop's own doc comment above for exactly where `0.14` comes from — a measured
  // module-coverage figure, not a chosen-for-looks fraction.
  const markSize = Math.round(size * 0.14)
  const markInset = (size - markSize) / 2
  // #298 review, F5(b) — the quiet zone. ISO/IEC 18004 §5.3.2 requires a light margin of at
  // least 4 modules around the whole symbol: a scanner's finder-pattern search relies on the
  // 1:1:3:1:1 dark/light ratio ENDING somewhere light, and without a margin the pattern runs
  // straight into whatever sits outside it. `QrMark` always painted its own white background
  // exactly `size × size` with nothing beyond it, so this was never actually at risk until #283/
  // C3 put the card itself on a dark (`nacht`) surface — before that, the surrounding card was
  // light too, and the quiet zone existed by accident of context rather than by the component's
  // own construction. The geometry (a real 4-module margin, this component's own padding, not
  // inherited from whatever card happens to sit around it) IS reserved unconditionally.
  // #298 review, F12 (Musti, second pass) — its BRIGHTNESS is not: this margin and the symbol's
  // own background both paint `t.color.karte`, which is `#1d2013` in dark mode — near-black, not
  // a light quiet zone at all. That's real, but not this component's to fix on its own: `App.tsx`
  // hardcodes `mode="light"` (Musti's prior review already named this latent and out of scope for
  // #298). Scoped to what actually holds: light in the one mode this app currently renders.
  const QUIET_ZONE_MODULES = 4
  const quietZonePx = cell * QUIET_ZONE_MODULES

  return (
    // `testID` here (not just on `qr-mark` below) is what lets QrMark.test.tsx's own geometry
    // test (#298 F5's decision, Musti's ruling — a unit test against the real rendered geometry,
    // no decoder) read the quiet zone's actual rendered `padding` back out, rather than
    // re-deriving it from a constant duplicated into the test.
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
