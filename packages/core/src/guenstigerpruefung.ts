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
import {
  progressionsvorbehaltSchranke,
  type ProgressionsvorbehaltEingabe,
  type TarifBestandteil,
  type Unschaerfe,
} from './veranlagungsartenvergleich'

const SPARERPAUSCHBETRAG_EINZEL = 1000
const SPARERPAUSCHBETRAG_ZUSAMMEN = 2000

const ABGELTUNGSSATZ = 0.25

const KIST_ERMAESSIGUNG_ANTEIL = 0.25

export interface GuenstigerpruefungEingaben {
  readonly kapitalertraege: number
  readonly uebrigesZvE: number
  readonly year: number
  readonly veranlagung: 'einzel' | 'zusammen'
  readonly progressionsvorbehalt: ProgressionsvorbehaltEingabe
  readonly kirchensteuerFaktor?: KirchensteuerFaktor
}

/** Herkunfts-Metadaten an beiden Zahlen: beide tragen dieselben Eingaben und Bestandteile — die Unschärfe steckt im `unschaerfe`-Feld. */
export interface GuenstigerpruefungHerkunft {
  readonly kapitalertraege: number
  readonly uebrigesZvE: number
  readonly sparerpauschbetrag: number
  readonly veranlagung: 'einzel' | 'zusammen'
  readonly bestandteile: readonly TarifBestandteil[]
}

export type Guenstigerpruefung =
  | {
      readonly aussage: 'eindeutig'
      readonly empfehlung: 'abgeltung' | 'persoenlich'
      readonly abgeltung: number
      readonly persoenlich: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: GuenstigerpruefungHerkunft
    }
  | {
      readonly aussage: 'zu-knapp'
      readonly abgeltung: number
      readonly persoenlich: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: GuenstigerpruefungHerkunft
    }
  | {
      readonly aussage: 'unbestimmt'
      readonly abgeltung: number
      readonly persoenlich: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
      readonly herkunft: GuenstigerpruefungHerkunft
    }

function validate(input: GuenstigerpruefungEingaben): void {
  if (!Number.isFinite(input.kapitalertraege) || !Number.isFinite(input.uebrigesZvE)) {
    throw new RangeError('kapitalertraege and uebrigesZvE must be finite numbers')
  }
  if (input.kapitalertraege < 0 || input.uebrigesZvE < 0) {
    throw new RangeError('kapitalertraege and uebrigesZvE must not be negative')
  }
  if (!Number.isInteger(input.kapitalertraege) || !Number.isInteger(input.uebrigesZvE)) {
    throw new RangeError('kapitalertraege and uebrigesZvE must be whole euros (integers)')
  }
}

function tarifAufBasis(basis: number, veranlagung: 'einzel' | 'zusammen', year: IncomeTaxYear): number {
  if (veranlagung === 'einzel') return incomeTax(basis, year)
  return splittingTarif(basis, 0, year)
}

function persoenlicheSteuer(input: GuenstigerpruefungEingaben, year: IncomeTaxYear, faktor: KirchensteuerFaktor): number {
  const { kapitalertraege, uebrigesZvE, veranlagung } = input
  const freigrenze = veranlagung === 'einzel' ? soliFreigrenzen(year).einzel : soliFreigrenzen(year).zusammen

  const estMit = tarifAufBasis(uebrigesZvE + kapitalertraege, veranlagung, year)
  const estOhne = tarifAufBasis(uebrigesZvE, veranlagung, year)
  const estDifferenz = estMit - estOhne

  const soliDifferenz = solidaritaetszuschlag(estMit, freigrenze) - solidaritaetszuschlag(estOhne, freigrenze)
  const kist = kirchensteuer(estDifferenz, faktor)

  return estDifferenz + soliDifferenz + kist
}

export function guenstigerpruefung(input: GuenstigerpruefungEingaben): Guenstigerpruefung {
  validate(input)
  const { kapitalertraege, uebrigesZvE, veranlagung, progressionsvorbehalt } = input
  if (!isSupportedIncomeTaxYear(input.year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  }
  const year: IncomeTaxYear = input.year
  const faktor = input.kirchensteuerFaktor ?? 0

  const sparerpauschbetrag = veranlagung === 'einzel' ? SPARERPAUSCHBETRAG_EINZEL : SPARERPAUSCHBETRAG_ZUSAMMEN
  const bemessung = Math.max(0, kapitalertraege - sparerpauschbetrag)
  const abgeltungESt = Math.floor(ABGELTUNGSSATZ * bemessung)

  const soliFreigrenze = veranlagung === 'einzel' ? soliFreigrenzen(year).einzel : soliFreigrenzen(year).zusammen
  const soliAbgeltung = solidaritaetszuschlag(abgeltungESt, soliFreigrenze)

  const kistAbgeltung = kirchensteuer(abgeltungESt, faktor)
  const ermaessigung = Math.floor(KIST_ERMAESSIGUNG_ANTEIL * kistAbgeltung)
  const abgeltung = abgeltungESt - ermaessigung + kistAbgeltung + soliAbgeltung

  const persoenlich = persoenlicheSteuer(input, year, faktor)

  const delta = persoenlich - abgeltung

  const bestandteile: TarifBestandteil[] =
    faktor === 0 ? ['einkommensteuer', 'solidaritaetszuschlag'] : ['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer']
  const herkunft: GuenstigerpruefungHerkunft = {
    kapitalertraege,
    uebrigesZvE,
    sparerpauschbetrag,
    veranlagung,
    bestandteile,
  }

  const unschaerfe = progressionsvorbehaltSchranke(progressionsvorbehalt)

  if (unschaerfe.kind === 'unbestimmt') {
    return { aussage: 'unbestimmt', abgeltung, persoenlich, delta, unschaerfe, herkunft }
  }
  if (Math.abs(delta) > unschaerfe.obergrenze) {
    return {
      aussage: 'eindeutig',
      empfehlung: delta < 0 ? 'persoenlich' : 'abgeltung',
      abgeltung,
      persoenlich,
      delta,
      unschaerfe,
      herkunft,
    }
  }
  return { aussage: 'zu-knapp', abgeltung, persoenlich, delta, unschaerfe, herkunft }
}
