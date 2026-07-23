// Official provider sign-in marks (same paths as the design system's auth.html), rendered with
// react-native-svg so they work native + web.
import { Svg, Path, type SvgProps } from 'react-native-svg'

export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityRole="image" aria-hidden>
      <Path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z" />
      <Path fill="#34A853" d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26A5.42 5.42 0 0 1 9 14.42a5.4 5.4 0 0 1-5.06-3.7H.93v2.33A9 9 0 0 0 9 18z" />
      <Path fill="#FBBC05" d="M3.94 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <Path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .93 4.95l3.01 2.33A5.4 5.4 0 0 1 9 3.58z" />
    </Svg>
  )
}

export function AppleMark({ size = 20, color = '#ffffff' }: { size?: number; color?: string } & Pick<SvgProps, never>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 814 1000" accessibilityRole="image" aria-hidden>
      <Path
        fill={color}
        d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 71-69 141-43 61-88 122-156 122s-86-40-165-40c-77 0-104 41-167 41s-107-57-157-127C42 787 0 664 0 547c0-187 122-286 242-286 64 0 117 42 157 42 38 0 97-45 170-45 27 0 127 3 219 83zM554 172c32-38 55-90 55-143 0-7-1-15-2-21-52 2-115 35-153 79-29 33-57 86-57 139 0 8 2 16 2 19 3 0 9 1 14 1 47 0 106-31 141-74z"
      />
    </Svg>
  )
}
