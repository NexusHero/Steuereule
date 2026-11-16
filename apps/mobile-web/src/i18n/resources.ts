// The app's own strings live in one JSON file per language (`locales/<lng>.json`): translators and
// tools work on plain JSON, and German and English no longer sit side by side as mirrored code.
// `locales.test.tsx` keeps both files on the same keys and placeholders.
import de from './locales/de.json'
import en from './locales/en.json'

export const APP_NS = 'app'

export const appResources = {
  de: { [APP_NS]: de },
  en: { [APP_NS]: en },
} as const

export type AppLocale = keyof typeof appResources
