import type { Einkunftsart } from './einkunftsarten'
import { berechne, type Berechnungsstand, type Posten } from './berechnung'
import { chfNachEur, type Wechselkurs } from './wechselkurs'
import { CH_WOHNSITZ_VALUES, type ChWohnsitz } from './interview'

export { CH_WOHNSITZ_VALUES }
export type { ChWohnsitz }

export const GRENZGAENGER_NICHTRUECKKEHRTAGE = 60

export type GrenzgaengerStatus = 'echter-grenzgaenger' | 'kein-grenzgaenger'

export function grenzgaengerStatus(wohnsitz: ChWohnsitz, nichtrueckkehrtage: number): GrenzgaengerStatus {
  if (!Number.isInteger(nichtrueckkehrtage) || nichtrueckkehrtage < 0) {
    throw new RangeError('nichtrueckkehrtage must be a non-negative integer')
  }
  if (wohnsitz === 'Schweiz') return 'kein-grenzgaenger'
  return nichtrueckkehrtage > GRENZGAENGER_NICHTRUECKKEHRTAGE ? 'kein-grenzgaenger' : 'echter-grenzgaenger'
}

export type LohnausweisFeldId =
  | 'lohn'
  | 'gehaltsnebenleistungen'
  | 'unregelmaessige-leistungen'
  | 'kapitalleistungen'
  | 'beteiligungsrechte'
  | 'sitzungsgelder'
  | 'andere-leistungen'
  | 'bruttolohn-total'
  | 'ahv-beitraege'
  | 'berufliche-vorsorge'
  | 'nettolohn'
  | 'quellensteuer'
  | 'spesen'
  | 'weitere-nebenleistungen'
  | 'bemerkungen'

export interface LohnausweisFeld {
  readonly ziffer: string
  readonly id: LohnausweisFeldId
  readonly art: 'chf-betrag' | 'freitext'
  readonly postenRelevant: boolean
}

export const LOHNAUSWEIS_FELDER: readonly LohnausweisFeld[] = [
  { ziffer: '1', id: 'lohn', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '2', id: 'gehaltsnebenleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '3', id: 'unregelmaessige-leistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '4', id: 'kapitalleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '5', id: 'beteiligungsrechte', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '6', id: 'sitzungsgelder', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '7', id: 'andere-leistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '8', id: 'bruttolohn-total', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '9', id: 'ahv-beitraege', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '10', id: 'berufliche-vorsorge', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '11', id: 'nettolohn', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '12', id: 'quellensteuer', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '13', id: 'spesen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '14', id: 'weitere-nebenleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '15', id: 'bemerkungen', art: 'freitext', postenRelevant: false },
]

export type LohnausweisWerte = Partial<Record<LohnausweisFeldId, number>>

export type LohnausweisBetragFeldId = Exclude<LohnausweisFeldId, 'bemerkungen'>

export const LOHNAUSWEIS_BETRAG_FELDER: readonly LohnausweisBetragFeldId[] = LOHNAUSWEIS_FELDER.filter(
  (feld) => feld.art === 'chf-betrag',
).map((feld) => feld.id) as readonly LohnausweisBetragFeldId[]

export function offeneLohnausweisFelder(werte: LohnausweisWerte, status: GrenzgaengerStatus): readonly LohnausweisFeldId[] {
  const required = new Set<LohnausweisFeldId>(['bruttolohn-total', 'berufliche-vorsorge'])
  if (status === 'echter-grenzgaenger') required.add('quellensteuer')
  return LOHNAUSWEIS_FELDER.filter((feld) => required.has(feld.id) && werte[feld.id] === undefined).map((feld) => feld.id)
}

export type ChPostenArt =
  | 'Bruttolohn'
  | 'Quellensteuer'
  | 'Pensionskasse'
  | 'AHV'
  | 'Saeule3a'
  | 'Krankenkasse'
  | 'Familienzulage'

/** A CH line item with full provenance: Lohnausweis-Ziffer times exchange rate. */
export interface ChPosten {
  readonly id: string
  readonly art: ChPostenArt
  readonly ziffer?: string
  readonly betragChf: number
  readonly wechselkurs: Wechselkurs
  readonly betragEur: number
}

function feldZuPostenArt(feld: LohnausweisFeldId): ChPostenArt {
  switch (feld) {
    case 'bruttolohn-total':
      return 'Bruttolohn'
    case 'quellensteuer':
      return 'Quellensteuer'
    case 'berufliche-vorsorge':
      return 'Pensionskasse'
    case 'ahv-beitraege':
      return 'AHV'
    default:
      throw new RangeError(`Lohnausweis field "${feld}" has no ChPosten mapping`)
  }
}

function makeChPosten(id: string, art: ChPostenArt, betragChf: number, wechselkurs: Wechselkurs, ziffer?: string): ChPosten {
  return { id, art, betragChf, wechselkurs, betragEur: chfNachEur(betragChf, wechselkurs.kurs), ...(ziffer !== undefined ? { ziffer } : {}) }
}

export function chPostenAusLohnausweis(werte: LohnausweisWerte, wechselkurs: Wechselkurs): readonly ChPosten[] {
  const posten: ChPosten[] = []
  for (const feld of LOHNAUSWEIS_FELDER) {
    if (!feld.postenRelevant || feld.art !== 'chf-betrag') continue
    const betragChf = werte[feld.id]
    if (betragChf === undefined) continue
    posten.push(makeChPosten(`ch-lohnausweis-${feld.id}`, feldZuPostenArt(feld.id), betragChf, wechselkurs, feld.ziffer))
  }
  return posten
}

export function saeule3aAbzug(eingezahltChf: number, wechselkurs: Wechselkurs): ChPosten {
  return makeChPosten('ch-saeule-3a', 'Saeule3a', eingezahltChf, wechselkurs)
}

export function krankenkasseAbzug(beitragChf: number, wechselkurs: Wechselkurs): ChPosten {
  return makeChPosten('ch-krankenkasse', 'Krankenkasse', beitragChf, wechselkurs)
}

export function zulagenVerrechnen(chZulagenEur: number, deKindergeldEur: number): number {
  if (!Number.isFinite(chZulagenEur) || chZulagenEur < 0) throw new RangeError('chZulagenEur must be a non-negative finite number')
  if (!Number.isFinite(deKindergeldEur) || deKindergeldEur < 0) {
    throw new RangeError('deKindergeldEur must be a non-negative finite number')
  }
  return Math.round((chZulagenEur - deKindergeldEur) * 100) / 100
}

export function bruttolohnAlsKernposten(posten: ChPosten): Posten | null {
  if (posten.art !== 'Bruttolohn') return null
  return chPostenAlsKernposten(posten)
}

export function chPostenAlsKernposten(posten: ChPosten): Posten | null {
  let rolle: Posten['rolle']
  let quelle: Posten['quelle']
  switch (posten.art) {
    case 'Bruttolohn':
      rolle = 'einnahme'
      quelle = { art: 'beleg', belegId: 'lohnausweis' }
      break
    case 'Pensionskasse':
      rolle = 'vorsorgeaufwand'
      quelle = { art: 'beleg', belegId: 'lohnausweis' }
      break
    case 'Quellensteuer':
      rolle = 'anrechnung'
      quelle = { art: 'beleg', belegId: 'lohnausweis' }
      break
    case 'Saeule3a':
    case 'Krankenkasse':
      rolle = 'vorsorgeaufwand'
      quelle = { art: 'eingabe' }
      break
    case 'AHV':
    case 'Familienzulage':
      return null
  }
  return {
    id: posten.id,
    einkunftsart: 'Grenzgänger',
    rolle,
    betrag: Math.round(posten.betragEur),
    quelle,
  }
}

/** The CH line items to fold, plus the honest open/gated facts that may block a determined result. */
export interface GrenzgaengerBerechnungsInput {
  readonly lohnausweis: LohnausweisWerte
  readonly saeule3aChf?: number
  readonly krankenkasseChf?: number
  readonly status: GrenzgaengerStatus
  readonly wechselkurs: Wechselkurs
  readonly gegated: readonly Einkunftsart[]
}

export function grenzgaengerChPosten(input: {
  readonly lohnausweis: LohnausweisWerte
  readonly saeule3aChf?: number
  readonly krankenkasseChf?: number
  readonly wechselkurs: Wechselkurs
}): readonly ChPosten[] {
  const posten: ChPosten[] = [...chPostenAusLohnausweis(input.lohnausweis, input.wechselkurs)]
  if (input.saeule3aChf !== undefined) posten.push(saeule3aAbzug(input.saeule3aChf, input.wechselkurs))
  if (input.krankenkasseChf !== undefined) posten.push(krankenkasseAbzug(input.krankenkasseChf, input.wechselkurs))
  return posten
}

export function grenzgaengerStand(input: GrenzgaengerBerechnungsInput): Berechnungsstand {
  const kernposten = grenzgaengerChPosten(input)
    .map(chPostenAlsKernposten)
    .filter((p): p is Posten => p !== null)
  const offenePosten = offeneLohnausweisFelder(input.lohnausweis, input.status).length
  return berechne({ posten: kernposten, offenePosten, konflikte: [], gegated: input.gegated })
}

export const LOHNAUSWEIS_UNKLAR = 'unklar'

export function istGueltigerLohnausweisBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function serialisiereLohnausweisFeld(wert: number | null | typeof LOHNAUSWEIS_UNKLAR): string | null {
  if (wert === null) return null
  if (wert === LOHNAUSWEIS_UNKLAR) return LOHNAUSWEIS_UNKLAR
  if (!istGueltigerLohnausweisBetrag(wert)) {
    throw new RangeError(`lohnausweis: erfasst value must be a non-negative integer`)
  }
  return String(wert)
}

export function deserialisiereLohnausweisFeld(value: string | null): number | null | typeof LOHNAUSWEIS_UNKLAR {
  if (value === null) return null
  if (value === LOHNAUSWEIS_UNKLAR) return LOHNAUSWEIS_UNKLAR
  const wert = Number(value)
  if (!istGueltigerLohnausweisBetrag(wert)) {
    throw new Error(`lohnausweis: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return wert
}
