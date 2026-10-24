// Apple logo (monochrome) for the Sign in with Apple button (REQ-008, Apple half — flagged
// off until an Apple Developer account + a shipped iOS build exist). A single-colour mark so it
// works on the ghost button's ink without a white backdrop; Apple's own sign-in mark is black.
import { Svg, Path } from 'react-native-svg'

export function AppleG({ size = 20 }: { readonly size?: number } = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Apple">
      <Path
        fill="#1d1d1f"
        d="M17.05 12.54c-.03-2.6 2.13-3.85 2.23-3.91-1.22-1.78-3.11-2.03-3.78-2.06-1.61-.16-3.14.95-3.95.95-.82 0-2.08-.92-3.42-.9-1.76.03-3.38 1.02-4.28 2.6-1.83 3.17-.47 7.86 1.31 10.43.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.85 3.38-.85 1.58 0 2.03.85 3.42.82 1.41-.02 2.31-1.28 3.17-2.55 1-1.46 1.41-2.88 1.44-2.95-.03-.02-2.76-1.06-2.78-4.2zM14.45 4.9c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45z"
      />
    </Svg>
  )
}
