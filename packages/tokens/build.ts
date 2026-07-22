// Token pipeline runner (ADR-050). Source = the checked-in design-system manifest; outputs =
// CSS variables (marketing DOM) + a typed RN theme object (the app). Style Dictionary is the
// orchestrator: the normalized tree is registered as its token source and two custom formats
// carry the RN shadow/easing transforms it can't express natively.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import StyleDictionary from 'style-dictionary'
import { manifestToTokens, type Manifest } from './src/manifest-to-tokens'
import { renderCss } from './src/render-css'
import { renderRnTheme } from './src/render-rn'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const MANIFEST = resolve(here, '../../finanzo-funke-design-system/project/_ds_manifest.json')

export async function build(): Promise<void> {
  const manifest = require(MANIFEST) as Manifest
  const normalized = manifestToTokens(manifest)

  // Flatten to a Style-Dictionary token source so SD owns the pipeline; the two custom formats
  // render from the same normalized tree (one token truth).
  const sdTokens: Record<string, { value: string }> = {}
  for (const group of Object.values(normalized.base)) {
    for (const t of group) sdTokens[t.cssVar.replace(/^--/, '')] = { value: t.value }
  }

  // Absolute buildPath so output lands in the package regardless of invocation CWD.
  const dist = resolve(here, 'dist') + '/'
  const sd = new StyleDictionary({
    tokens: sdTokens,
    platforms: {
      css: { transformGroup: 'css', buildPath: dist, files: [{ destination: 'tokens.css', format: 'funke/css' }] },
      rn: { transformGroup: 'js', buildPath: dist, files: [{ destination: 'theme.ts', format: 'funke/rn-theme' }] },
    },
  })

  sd.registerFormat({ name: 'funke/css', format: () => renderCss(normalized) })
  sd.registerFormat({ name: 'funke/rn-theme', format: () => renderRnTheme(normalized) })

  await sd.buildAllPlatforms()
}

// Run when invoked directly (pnpm build).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build()
  // eslint-disable-next-line no-console
  console.log('tokens: wrote dist/tokens.css + dist/theme.ts')
}
