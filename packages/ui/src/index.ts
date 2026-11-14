export { ThemeProvider, ThemeContext, type UiTheme, type ThemeProviderProps } from './theme/ThemeProvider'
export { useTheme, inkOnFunke } from './theme/useTheme'

export { createI18n } from './i18n/createI18n'
export { uiResources, UI_NS, type UiLocale } from './i18n/resources'

export { Card, type CardProps, type CardVariant } from './components/Card'
export { Button, type ButtonProps, type ButtonVariant } from './components/Button'
export { Pill, type PillProps } from './components/Pill'
export { Sticker, type StickerProps } from './components/Sticker'
export { AiChip, type AiChipProps } from './components/AiChip'
export { OwlGlyph, type OwlGlyphProps } from './components/OwlGlyph'
export {
  ProvenanceChip as HerkunftsChip,
  type ProvenanceChipProps as HerkunftsChipProps,
  type ProvenanceChipVariant as HerkunftsChipVariant,
  type Provenance as Herkunft,
} from './components/HerkunftsChip'
export { Input, type InputProps, type InputType } from './components/Input'
export { DateInput, germanDateToIso, isoDateToGerman, maskGermanDate, type DateInputProps } from './components/DateInput'
export { Field as Feld, type FieldProps as FeldProps } from './components/Field'
export { Chip, type ChipProps, type ChipVariant } from './components/Chip'
export { Option, type OptionProps } from './components/Option'
export { Sheet, type SheetProps } from './components/Sheet'
export { TabBar, TAB_BAR_HEIGHT, TAB_ICON_PATHS, tabBarClearance, type TabBarProps, type TabItem } from './components/TabBar'

export { Gallery } from './gallery/Gallery'

export { useReducedMotion } from './motion/useReducedMotion'
export { autoCompleteProps, type InputAutoComplete } from './lib/autoComplete'
export { useBreakpoint, resolveBreakpoint, type Breakpoint } from './responsive/useBreakpoint'
export { WIDE_CONTENT_MAX_WIDTH, FLOW_CONTENT_MAX_WIDTH, NARROW_CONTENT_MAX_WIDTH } from './responsive/contentWidth'
export {
  hapticSelection,
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
  setHapticsEnabled,
  isHapticsEnabled,
} from './lib/haptics'
export { TYPE, type TypeRole, type LayoutRoles, type ScreenLayout } from './theme/roles'
