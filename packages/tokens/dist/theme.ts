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
    "kontur": 1
  },
  "radius": {
    "s": 10,
    "m": 14,
    "lg": 20,
    "pille": 999
  },
  "size": {
    "xs": 12,
    "s": 14,
    "m": 16,
    "l": 18,
    "xl": 24,
    "2xl": 28,
    "3xl": 34,
    "held": 52
  },
  "font": {
    "display": "\"Geist\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
    "text": "\"Geist\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
    "mono": "\"Geist Mono\", ui-monospace, Menlo, monospace"
  },
  "weight": {
    "normal": "400",
    "halb": "500",
    "fett": "600",
    "schwer": "600"
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
      "grund": "#ffffff",
      "karte": "#ffffff",
      "tinte": "#0f0f14",
      "tinte2": "#5c5c66",
      "linie": "#c6c6cc",
      "linieWeich": "#e6e6e9",
      "funke": "#c9f229",
      "funkeHell": "#e3fa8d",
      "funkeWeich": "#f2fbd2",
      "funkeTinte": "#40510a",
      "nacht": "#0f0f14",
      "nachtKarte": "#191920",
      "nachtText": "#ededf3",
      "nachtLinie": "#2a2a31",
      "ki": "#5c5c66",
      "kiWeich": "#f3f3f5",
      "kiLinie": "#d4d4da",
      "kiTinte": "#3a3a44",
      "ok": "#1f9d55",
      "okWeich": "#def4e2",
      "warn": "#b5861a",
      "warnWeich": "#f3f3f5",
      "fehler": "#e0362c",
      "fehlerWeich": "#fde3de"
    },
    "shadow": {
      "hart": {
        "shadowColor": "#0f0f14",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "hartS": {
        "shadowColor": "#0f0f14",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "hartL": {
        "shadowColor": "#0f0f14",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "ki": {
        "shadowColor": "#5c5c66",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      }
    }
  },
  "dark": {
    "color": {
      "grund": "#0f0f14",
      "karte": "#191920",
      "tinte": "#ededf3",
      "tinte2": "#a0a0ac",
      "linie": "#3c3c45",
      "linieWeich": "#27272e",
      "funke": "#c9f229",
      "funkeHell": "#e3fa8d",
      "funkeWeich": "#262d10",
      "funkeTinte": "#d9f077",
      "nacht": "#191920",
      "nachtKarte": "#23232b",
      "nachtText": "#ededf3",
      "nachtLinie": "#33333c",
      "ki": "#5c5c66",
      "kiWeich": "#1f1f27",
      "kiLinie": "#3c3c45",
      "kiTinte": "#c8c8d2",
      "ok": "#1f9d55",
      "okWeich": "#143020",
      "warn": "#b5861a",
      "warnWeich": "#1f1f27",
      "fehler": "#e96a61",
      "fehlerWeich": "#3b1512"
    },
    "shadow": {
      "hart": {
        "shadowColor": "#ededf3",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "hartS": {
        "shadowColor": "#ededf3",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "hartL": {
        "shadowColor": "#ededf3",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
      },
      "ki": {
        "shadowColor": "#5c5c66",
        "shadowOffset": {
          "width": 0,
          "height": 0
        },
        "shadowOpacity": 1,
        "shadowRadius": 0,
        "elevation": 0
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
