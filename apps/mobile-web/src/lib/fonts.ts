import { Platform } from 'react-native'
import { Asset } from 'expo-asset'
import geist400 from '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'
import geist500 from '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'
import geist600 from '@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'
import geistMono400 from '@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf'
import geistMono500 from '@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf'

/**
 * The Graphit typefaces (Geist, Geist Mono), served from the app's own bundle: no request leaves
 * for a font host. One `@font-face` per weight under the family name the tokens use, so
 * `fontFamily: "Geist"` with `fontWeight: '500'` picks the Medium file instead of a faked bold.
 * The weights are exactly the token weights (400 / 500 / 600); mono has no 600 in the tokens' use.
 */
export interface FontFace {
  readonly family: string
  readonly weight: string
  readonly source: number | string
}

export const APP_FONT_FACES: readonly FontFace[] = [
  { family: 'Geist', weight: '400', source: geist400 },
  { family: 'Geist', weight: '500', source: geist500 },
  { family: 'Geist', weight: '600', source: geist600 },
  { family: 'Geist Mono', weight: '400', source: geistMono400 },
  { family: 'Geist Mono', weight: '500 600', source: geistMono500 },
]

export const APP_FONTS_STYLE_ID = 'steuereule-schriften'

export function fontFaceCss(faces: readonly FontFace[], uriOf: (source: number | string) => string): string {
  return faces
    .map((f) => `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url("${uriOf(f.source)}") format("truetype")}`)
    .join('\n')
}

/** Web only: writes the faces into the document once. Native keeps the system face of the token stack. */
export function installAppFonts(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  if (document.getElementById(APP_FONTS_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = APP_FONTS_STYLE_ID
  style.textContent = fontFaceCss(APP_FONT_FACES, (source) => (typeof source === 'string' ? source : Asset.fromModule(source).uri))
  document.head.appendChild(style)
}
