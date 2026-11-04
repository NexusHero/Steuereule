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
        label: 'Origin',
        beleg: 'Beleg',
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
