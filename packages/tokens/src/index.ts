// @steuereule/tokens — the one token truth (ADR-050), generated from the design-system manifest.
// App code imports the typed RN theme from here; the marketing DOM consumes dist/tokens.css.
// Never hand-edit dist/* — run `pnpm --filter @steuereule/tokens build`.
export { theme, modeTokens, type Theme, type ThemeMode } from '../dist/theme'
export type { RnShadow } from './render-rn'
export type { ThemeMode as Mode } from '../dist/theme'
