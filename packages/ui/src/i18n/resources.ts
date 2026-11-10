export const UI_NS = 'ui'

export const uiResources = {
  de: {
    [UI_NS]: {
      herkunft: {
        label: 'Herkunft',
        beleg: 'Beleg',
        regel: 'Regel',
        rechenweg: 'Rechenweg',
        hinweis: 'Hinweis',
        okBadge: 'Geprüft',
        pruefenBadge: 'Prüfen',
      },
      ai: {
        marke: 'KI',
      },
      sheet: {
        schliessen: 'Schließen',
      },
    },
  },
  en: {
    [UI_NS]: {
      herkunft: {
        label: 'Origin',
        beleg: 'Beleg',
        regel: 'Rule',
        rechenweg: 'Calculation',
        hinweis: 'Note',
        okBadge: 'Verified',
        pruefenBadge: 'Review',
      },
      ai: {
        marke: 'AI',
      },
      sheet: {
        schliessen: 'Close',
      },
    },
  },
} as const

export type UiLocale = keyof typeof uiResources
