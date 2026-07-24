// Official Google "G" mark (DS Auth.jsx, 20×20, standard brand colors).
// Matches the design-system reference exactly — no creative interpretation.
import { Svg, Path } from 'react-native-svg'

export function GoogleG({ size = 20 }: { readonly size?: number } = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
      />
      <Path
        fill="#34A853"
        d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26A5.42 5.42 0 0 1 9 14.42a5.4 5.4 0 0 1-5.06-3.7H.93v2.33A9 9 0 0 0 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.94 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .93 4.95l3.01 2.33A5.4 5.4 0 0 1 9 3.58z"
      />
    </Svg>
  )
}
