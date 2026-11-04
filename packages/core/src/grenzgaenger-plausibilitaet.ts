import {
  grenzgaengerStatus,
  offeneLohnausweisFelder,
  GRENZGAENGER_NICHTRUECKKEHRTAGE,
  type ChWohnsitz,
  type LohnausweisFeldId,
  type LohnausweisWerte,
} from './grenzgaenger'
import type { Wechselkurs } from './wechselkurs'

export type PlausibilitaetsGrad = 'widerspruch' | 'hinweis' | 'offen'

export interface PlausibilitaetsPunkt {
  readonly grad: PlausibilitaetsGrad
  readonly code: string
  readonly feld?: LohnausweisFeldId
}

export interface PlausibilitaetsBefund {
  readonly einreichbar: boolean
  readonly punkte: readonly PlausibilitaetsPunkt[]
}

export interface GrenzgaengerPlausibilitaetsInput {
  readonly wohnsitz: ChWohnsitz
  readonly nichtrueckkehrtage: number
  readonly wechselkurs: Wechselkurs
  readonly lohnausweis: LohnausweisWerte
  readonly hatKinder: boolean
  readonly hatFamilienzulagen: boolean
}

export function pruefeGrenzgaenger(input: GrenzgaengerPlausibilitaetsInput): PlausibilitaetsBefund {
  const status = grenzgaengerStatus(input.wohnsitz, input.nichtrueckkehrtage)
  const punkte: PlausibilitaetsPunkt[] = []

  if (input.wechselkurs.modus === 'tatsaechlich' && input.wechselkurs.belegId === undefined) {
    punkte.push({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  }

  for (const feld of offeneLohnausweisFelder(input.lohnausweis, status)) {
    punkte.push({ grad: 'offen', code: 'lohnausweis-fehlt', feld })
  }

  const bruttolohn = input.lohnausweis['bruttolohn-total']
  const nettolohn = input.lohnausweis.nettolohn
  const ahv = input.lohnausweis['ahv-beitraege']
  const pk = input.lohnausweis['berufliche-vorsorge']
  if (bruttolohn !== undefined && nettolohn !== undefined && ahv !== undefined && pk !== undefined) {
    if (nettolohn !== bruttolohn - ahv - pk) {
      punkte.push({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
    }
  }

  if (input.hatFamilienzulagen && !input.hatKinder) {
    punkte.push({ grad: 'widerspruch', code: 'zulagen-ohne-kinder' })
  }

  if (input.wohnsitz === 'Deutschland' && input.nichtrueckkehrtage > GRENZGAENGER_NICHTRUECKKEHRTAGE) {
    punkte.push({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
  }

  const einreichbar = punkte.every((p) => p.grad === 'hinweis')
  return { einreichbar, punkte }
}
