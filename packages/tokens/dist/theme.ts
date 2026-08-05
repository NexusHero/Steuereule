// GENERATED from _ds_manifest.json via @steuereule/tokens — do not edit by hand.
export const theme = {
  "space": {
    "s1": 4,
    "s2": 8,
    "s3": 12,
    "s4": 16,
    "s5": 24,
    "s6": 32,
    "s7": 48,
    "kontur": 2
  },
  "radius": {
    "s": 12,
    "m": 20,
    "lg": 28,
    "pille": 999
  },
  "size": {
    "xs": 12,
    "s": 14,
    "m": 16,
    "l": 18,
    "xl": 24,
    "2xl": 32,
    "3xl": 44,
    "held": 60
  },
  "font": {
    "display": "\"Bricolage Grotesque\", \"Arial Black\", sans-serif",
    "text": "\"Schibsted Grotesk\", system-ui, sans-serif",
    "mono": "\"Space Mono\", ui-monospace, Menlo, monospace"
  },
  "weight": {
    "normal": "450",
    "halb": "600",
    "fett": "700",
    "schwer": "800"
  },
  "leading": {
    "eng": 1.05,
    "normal": 1.45
  },
  "tracking": {
    "display": "-0.03em",
    "label": "0.08em"
  },
  "duration": {
    "schnell": 120,
    "flott": 220,
    "auftritt": 380
  },
  "easing": {
    "feder": [
      0.34,
      1.56,
      0.64,
      1
    ],
    "zack": [
      0.2,
      0.9,
      0.3,
      1
    ]
  },
  "breakpoint": {
    "s": 375,
    "m": 768,
    "l": 1280
  },
  "light": {
    "color": {
      "grund": "#f4f2e9",
      "karte": "#ffffff",
      "tinte": "#191b12",
      "tinte2": "#5f6353",
      "linie": "#191b12",
      "linieWeich": "#dedacb",
      "funke": "#c9f229",
      "funkeHell": "#e3fa8d",
      "funkeWeich": "#f2fbd2",
      "funkeTinte": "#40510a",
      "nacht": "#191b12",
      "nachtKarte": "#262a1c",
      "nachtText": "#f4f2e9",
      "nachtLinie": "#3d4230",
      "ki": "#7c5cff",
      "kiWeich": "#ece6ff",
      "kiLinie": "#c7b8ff",
      "kiTinte": "#4630b8",
      "ok": "#1f9d55",
      "okWeich": "#def4e2",
      "warn": "#e07b00",
      "warnWeich": "#ffeecf",
      "fehler": "#e0362c",
      "fehlerWeich": "#fde3de"
    },
    "shadow": {
      "hart": {
        "shadowColor": "#191b12",
        "shadowOffset": {
          "width": 4,
          "height": 4
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 4
      },
      "hartS": {
        "shadowColor": "#191b12",
        "shadowOffset": {
          "width": 2,
          "height": 2
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 2
      },
      "hartL": {
        "shadowColor": "#191b12",
        "shadowOffset": {
          "width": 7,
          "height": 7
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 7
      },
      "ki": {
        "shadowColor": "#7c5cff",
        "shadowOffset": {
          "width": 4,
          "height": 4
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 4
      }
    }
  },
  "dark": {
    "color": {
      "grund": "#12140c",
      "karte": "#1d2013",
      "tinte": "#f2f0e3",
      "tinte2": "#a9ad99",
      "linie": "#f2f0e3",
      "linieWeich": "#33371f",
      "funke": "#c9f229",
      "funkeHell": "#e3fa8d",
      "funkeWeich": "#2b3312",
      "funkeTinte": "#d9f077",
      "nacht": "#0d0f08",
      "nachtKarte": "#1d2013",
      "nachtText": "#f4f2e9",
      "nachtLinie": "#313624",
      "ki": "#7c5cff",
      "kiWeich": "#251d4f",
      "kiLinie": "#5a48c4",
      "kiTinte": "#cfc4ff",
      "ok": "#1f9d55",
      "okWeich": "#143020",
      "warn": "#e07b00",
      "warnWeich": "#392a10",
      "fehler": "#e0362c",
      "fehlerWeich": "#3b1512"
    },
    "shadow": {
      "hart": {
        "shadowColor": "#f2f0e3",
        "shadowOffset": {
          "width": 4,
          "height": 4
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 4
      },
      "hartS": {
        "shadowColor": "#f2f0e3",
        "shadowOffset": {
          "width": 2,
          "height": 2
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 2
      },
      "hartL": {
        "shadowColor": "#f2f0e3",
        "shadowOffset": {
          "width": 7,
          "height": 7
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 7
      },
      "ki": {
        "shadowColor": "#7c5cff",
        "shadowOffset": {
          "width": 4,
          "height": 4
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 4
      }
    }
  }
} as const

export type Theme = typeof theme
export type ThemeMode = 'light' | 'dark'

/** Colour + shadow for a given mode; the scales (space, size, …) are mode-invariant. */
export function modeTokens(mode: ThemeMode) {
  return mode === "dark" ? theme.dark : theme.light
}
