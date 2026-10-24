// M2 — Plausibilitäts-Prüfung before submission, CH cases (ADR-029/012/013). The check is
// STRUCTURAL honesty, not a tax verdict: Widersprüche (contradictions, block submission),
// Hinweise (flags, non-blocking), and offene Pflichtfelder. It covers the CH-specific hazards:
// a tatsächlicher Kurs without its Beleg, an echter Grenzgänger without Quellensteuer, a
// Nettolohn that contradicts the Lohnausweis arithmetic, Familienzulagen without children, and
// the >45-Tage status loss. Pure, no I/O (ADR-0004) — the point CODES are stable identifiers
// for the i18n layer; the German text lives there, never here.
import {
  grenzgaengerStatus,
  offeneLohnausweisFelder,
  GRENZGAENGER_NICHTRUECKKEHRTAGE,
  type ChWohnsitz,
  type LohnausweisFeldId,
  type LohnausweisWerte,
} from './grenzgaenger.js'
import type { Wechselkurs } from './wechselkurs.js'

/** The three grades ADR-008/M2 distinguishes. `offen` = a required fact is missing. */
export type PlausibilitaetsGrad = 'widerspruch' | 'hinweis' | 'offen'

export interface PlausibilitaetsPunkt {
  readonly grad: PlausibilitaetsGrad
  /** Stable machine id (e.g. `wechselkurs-tatsaechlich-ohne-beleg`) for the i18n message. */
  readonly code: string
  /** The Lohnausweis field this point names, when it names one. */
  readonly feld?: LohnausweisFeldId
}

export interface PlausibilitaetsBefund {
  /** True only when nothing is widerspruch and nothing is offen (Hinweise never block). */
  readonly einreichbar: boolean
  readonly punkte: readonly PlausibilitaetsPunkt[]
}

export interface GrenzgaengerPlausibilitaetsInput {
  readonly wohnsitz: ChWohnsitz
  readonly nichtrueckkehrtage: number
  readonly wechselkurs: Wechselkurs
  readonly lohnausweis: LohnausweisWerte
  /** The interview's `kinder` answer reduced to a fact (Familienzulagen need children). */
  readonly hatKinder: boolean
  /** Whether a Familienzulagen-Nachweis / amount was supplied. */
  readonly hatFamilienzulagen: boolean
}

/**
 * The CH plausibility check. Derived status is computed here (never trusted from the caller)
 * so the check and the status cannot disagree about the 45-Tage rule.
 */
export function pruefeGrenzgaenger(input: GrenzgaengerPlausibilitaetsInput): PlausibilitaetsBefund {
  const status = grenzgaengerStatus(input.wohnsitz, input.nichtrueckkehrtage)
  const punkte: PlausibilitaetsPunkt[] = []

  // ADR-012 — "ohne Beleg kein tatsächlicher Kurs". The core type makes this unrepresentable
  // on CONSTRUCTION, but a persisted Wechselkurs (read back from storage) can be inconsistent;
  // the check catches that rather than trusting the input.
  if (input.wechselkurs.modus === 'tatsaechlich' && input.wechselkurs.belegId === undefined) {
    punkte.push({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  }

  // Required-but-empty Lohnausweis fields — the honest "offen" list (a missing field is never
  // fabricated into a zero amount).
  for (const feld of offeneLohnausweisFelder(input.lohnausweis, status)) {
    punkte.push({ grad: 'offen', code: 'lohnausweis-fehlt', feld })
  }

  // Nettolohn (Ziffer 11) must equal Bruttolohn (8) − AHV (9) − berufliche Vorsorge (10) —
  // the Lohnausweis's own arithmetic. A mismatch means a transcription error, never a tax fact.
  const bruttolohn = input.lohnausweis['bruttolohn-total']
  const nettolohn = input.lohnausweis.nettolohn
  const ahv = input.lohnausweis['ahv-beitraege']
  const pk = input.lohnausweis['berufliche-vorsorge']
  if (bruttolohn !== undefined && nettolohn !== undefined && ahv !== undefined && pk !== undefined) {
    if (nettolohn !== bruttolohn - ahv - pk) {
      punkte.push({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
    }
  }

  // ADR-029 point 6 — Familienzulagen are Kinderzulagen: they need children. Zulagen without
  // children is a contradiction, not a hint.
  if (input.hatFamilienzulagen && !input.hatKinder) {
    punkte.push({ grad: 'widerspruch', code: 'zulagen-ohne-kinder' })
  }

  // ADR-013 — more than 45 Nichtrückkehrtage ends Grenzgänger status. Not a contradiction (a
  // Wochenaufenthalter is a real case), but a flag the Quellensteuer treatment changed.
  if (input.wohnsitz === 'Deutschland' && input.nichtrueckkehrtage > GRENZGAENGER_NICHTRUECKKEHRTAGE) {
    punkte.push({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
  }

  const einreichbar = punkte.every((p) => p.grad === 'hinweis')
  return { einreichbar, punkte }
}
