// @steuereule/ui — the Funke design system rebuilt in React-Native primitives (ADR-050). Components
// read the theme from @steuereule/tokens via ThemeProvider; user-facing strings go through i18n.
export { ThemeProvider, ThemeContext, type UiTheme, type ThemeProviderProps } from './theme/ThemeProvider'
export { useTheme } from './theme/useTheme'

export { createI18n } from './i18n/createI18n'
export { uiResources, UI_NS, type UiLocale } from './i18n/resources'

export { Card, type CardProps, type CardVariant } from './components/Card'
export { Button, type ButtonProps, type ButtonVariant } from './components/Button'
export { Pill, type PillProps } from './components/Pill'
export { Sticker, type StickerProps } from './components/Sticker'
export { AiChip, type AiChipProps } from './components/AiChip'
export { HerkunftsChip, type HerkunftsChipProps, type Herkunft } from './components/HerkunftsChip'
export { Input, type InputProps, type InputType } from './components/Input'
export { Feld, type FeldProps } from './components/Feld'
export { Chip, type ChipProps, type ChipVariant } from './components/Chip'

export { Gallery } from './gallery/Gallery'

export { useBreakpoint, resolveBreakpoint, type Breakpoint } from './responsive/useBreakpoint'
export { WIDE_CONTENT_MAX_WIDTH } from './responsive/contentWidth'
