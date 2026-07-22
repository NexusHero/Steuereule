// The `ui` i18n namespace: every user-facing string a component renders itself. German is the base
// locale, English ships alongside it (ADR-0006) — both catalogs carry the same keys. Tax/legal
// terms stay German in both. The host app merges this namespace into its own i18next instance.

export const UI_NS = 'ui'

export const uiResources = {
  de: {
    [UI_NS]: {
      herkunft: {
        label: 'Herkunft',
        beleg: 'Beleg',
        regel: 'Regel',
        rechenweg: 'Rechenweg',
      },
      ai: {
        marke: 'KI',
      },
    },
  },
  en: {
    [UI_NS]: {
      herkunft: {
        // "Herkunft" is the DS provenance concept; the button label may translate, the tax terms below stay German.
        label: 'Origin',
        beleg: 'Beleg', // German tax term (receipt) — kept per ADR-0006
        regel: 'Rule',
        rechenweg: 'Calculation',
      },
      ai: {
        marke: 'AI',
      },
    },
  },
} as const

export type UiLocale = keyof typeof uiResources
