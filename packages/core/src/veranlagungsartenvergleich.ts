import {
  incomeTax,
  isSupportedIncomeTaxYear,
  kirchensteuer,
  solidaritaetszuschlag,
  soliFreigrenzen,
  splittingTarif,
  type IncomeTaxYear,
  type KirchensteuerFaktor,
} from './tarif'

export type ProgressionsvorbehaltEingabe =
  | { readonly art: 'keine' }
  | { readonly art: 'lohnersatzleistungen'; readonly betrag: number }
  | { readonly art: 'nicht-angegeben' }

export type Unschaerfe =
  | { readonly kind: 'bestimmt'; readonly obergrenze: number }
  | { readonly kind: 'unbestimmt'; readonly grund: 'progressionsvorbehalt-nicht-eingegeben' }

export type TarifBestandteil = 'einkommensteuer' | 'solidaritaetszuschlag' | 'kirchensteuer'

/** Herkunfts-Metadaten an beiden Zahlen. */
export interface VergleichsHerkunft {
  readonly zveA: number
  readonly zveB: number
  readonly bestandteile: readonly TarifBestandteil[]
}

export type Veranlagungsartenvergleich =
  | {
      readonly aussage: 'eindeutig'
      readonly empfehlung: 'einzel' | 'zusammen'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: VergleichsHerkunft
    }
  | {
      readonly aussage: 'zu-knapp'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: VergleichsHerkunft
    }
  | {
      readonly aussage: 'unbestimmt'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: VergleichsHerkunft
    }

export interface VeranlagungsartenvergleichEingaben {
  readonly zveA: number
  readonly zveB: number
  readonly year: number
  readonly progressionsvorbehalt: ProgressionsvorbehaltEingabe
  readonly kirchensteuerFaktor?: KirchensteuerFaktor
}

const MAX_GRENZSTEUERSATZ = 0.45

export function progressionsvorbehaltSchranke(pv: ProgressionsvorbehaltEingabe): Unschaerfe {
  switch (pv.art) {
    case 'keine':
      return { kind: 'bestimmt', obergrenze: 0 }
    case 'lohnersatzleistungen': {
      if (!Number.isFinite(pv.betrag) || pv.betrag < 0) {
        throw new RangeError('lohnersatzleistungen betrag must be a non-negative finite number')
      }
      return { kind: 'bestimmt', obergrenze: Math.ceil(MAX_GRENZSTEUERSATZ * pv.betrag) }
    }
    case 'nicht-angegeben':
      return { kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' }
  }
}

function validate(input: VeranlagungsartenvergleichEingaben): void {
  if (!Number.isFinite(input.zveA) || !Number.isFinite(input.zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (input.zveA < 0 || input.zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
}

export function veranlagungsartenvergleich(input: VeranlagungsartenvergleichEingaben): Veranlagungsartenvergleich {
  validate(input)
  const { zveA, zveB, progressionsvorbehalt } = input
  if (!isSupportedIncomeTaxYear(input.year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  }
  const year: IncomeTaxYear = input.year
  const faktor = input.kirchensteuerFaktor ?? 0

  const freigrenzen = soliFreigrenzen(year)
  const estA = incomeTax(zveA, year)
  const estB = incomeTax(zveB, year)
  const estEinzel = estA + estB
  const estZusammen = splittingTarif(zveA, zveB, year)

  const soliEinzel = solidaritaetszuschlag(estA, freigrenzen.einzel) + solidaritaetszuschlag(estB, freigrenzen.einzel)
  const soliZusammen = solidaritaetszuschlag(estZusammen, freigrenzen.zusammen)

  const kistEinzel = kirchensteuer(estA, faktor) + kirchensteuer(estB, faktor)
  const kistZusammen = kirchensteuer(estZusammen, faktor)

  const einzel = estEinzel + soliEinzel + kistEinzel
  const zusammen = estZusammen + soliZusammen + kistZusammen
  const delta = zusammen - einzel

  const bestandteile: TarifBestandteil[] = faktor === 0 ? ['einkommensteuer', 'solidaritaetszuschlag'] : ['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer']
  const herkunft: VergleichsHerkunft = { zveA: Math.floor(zveA), zveB: Math.floor(zveB), bestandteile }

  const unschaerfe = progressionsvorbehaltSchranke(progressionsvorbehalt)

  if (unschaerfe.kind === 'unbestimmt') {
    return { aussage: 'unbestimmt', einzel, zusammen, delta, unschaerfe, herkunft }
  }
  if (Math.abs(delta) > unschaerfe.obergrenze) {
    return { aussage: 'eindeutig', empfehlung: delta < 0 ? 'zusammen' : 'einzel', einzel, zusammen, delta, unschaerfe, herkunft }
  }
  return { aussage: 'zu-knapp', einzel, zusammen, delta, unschaerfe, herkunft }
}
