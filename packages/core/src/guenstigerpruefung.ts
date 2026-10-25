// Ticket 10.5 — die Günstigerprüfung (§ 32d Abs. 6 EStG): Abgeltungsteuer (25 %, § 32d Abs. 1)
// gegen die persönliche (tarifliche) Steuer auf die Kapitalerträge, als BOUNDED COMPARISON nach
// dem ADR-0034-Muster — nie ein nacktes Urteil. Deterministisch, dependency-frei (ADR-0004).
//
// NAMENS-DISZIPLIN (ADR-0034 §1): DIESES Modul trägt den Namen "Günstigerprüfung" — der
// Veranlagungsartenvergleich (10.2) heißt nicht so, und umgekehrt. Zwei verschiedene Vergleiche,
// zwei Namen, nie wieder einer.
//
// WAS HIER GERECHNET WIRD (bewusst zitiert, keine ausgedachten Konstanten):
//   - Abgeltungsteuer: 25 % der Bemessungsgrundlage (§ 32d Abs. 1 Satz 1 EStG). Die
//     Bemessungsgrundlage ist Kapitalerträge minus Sparerpauschbetrag (§ 20 Abs. 9 EStG:
//     1.000 € Einzel- / 2.000 € Zusammenveranlagung, seit VZ 2023). Ergebnis auf ganze Euro
//     abgerundet.
//   - Solidaritätszuschlag auf die Abgeltungsteuer (§ 4 SolZG 1995, Freigrenzen § 3 Abs. 3
//     SolZG — über tarif.ts's `solidaritaetszuschlag`).
//   - Kirchensteuer: § 51a EStG-Faktor (0/0,08/0,09), UND die § 32d Abs. 1 Satz 4-Regel: bei
//     Kirchensteuerpflicht ERMÄSSIGT sich die Abgeltungsteuer um 25 % der auf die
//     Kapitalerträge entfallenden Kirchensteuer. Beide Seiten werden mit demselben Faktor
//     behandelt — kein stiller Bias Richtung Abgeltung oder Tarif.
//   - Persönliche Steuer (§ 32d Abs. 6): die tarifliche ESt (§ 32a) auf (übriges zvE +
//     Kapitalerträge) minus die tarifliche ESt auf das übrige zvE — also der Teil der
//     tariflichen Steuer, der auf die Kapitalerträge entfällt — plus die Differenz des Soli
//     und die KiSt auf diese Differenz. Zusammenveranlagung: Splitting-Verfahren (§ 32a Abs. 5)
//     auf die kombinierte Basis.
//
// WAS BEWUSST NICHT HIER IST (ehrliche Grenzen, ADR-0034 Regel 3):
//   - Der Progressionsvorbehalt (§ 32b EStG) — der einzige ausgeschlossene Faktor, der das
//     Ergebnis KIPPEN kann. Er ist NICHT aus zvE allein schätzbar; `unschaerfe` ist genau die
//     ADR-0034-Schranke (geteilt mit dem Veranlagungsartenvergleich — EINE Definition,
//     `progressionsvorbehaltSchranke`). `aussage === 'eindeutig'` nur, wenn die Schranke
//     bestimmt ist UND |delta| sie übersteigt.
//   - Die RICHTIGKEIT des eingegebenen zvE (Ebene 3, ADR-0034 §4 bleibt offen): `uebrigesZvE`
//     ist im M1-Slice eine Einnahmen-Basis aus dem Kern (`berechne`), kein echtes zu
//     versteuerndes Einkommen (Werbungskosten/Sonderausgaben/Vorsorge fehlen) — das trägt
//     `herkunft` ehrlich mit.
//   - Verluste, Verlustverrechnung, ausländische Quellensteuer-Anrechnung (§ 32d Abs. 5),
//     das Ehegatten-Wahlrecht und die Fälle des § 32d Abs. 2 (Beteiligungen) — NICHT hier,
//     ein benannter Follow-up, keine stille Näherung.
//
// Ein nicht unterstütztes Steuerjahr WIRFT — es fällt nie auf die Koeffizienten eines
// Nachbarjahres zurück (dieselbe "throw, don't approximate"-Regel wie in tarif.ts).
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

/** § 20 Abs. 9 EStG — der Sparerpauschbetrag je Veranlagungsart (seit VZ 2023). */
const SPARERPAUSCHBETRAG_EINZEL = 1000
const SPARERPAUSCHBETRAG_ZUSAMMEN = 2000

/** § 32d Abs. 1 Satz 1 EStG — der Abgeltungsteuersatz. */
const ABGELTUNGSSATZ = 0.25

/** § 32d Abs. 1 Satz 4 EStG — die Kirchensteuer-Ermäßigung (25 % der entfallenden KiSt). */
const KIST_ERMAESSIGUNG_ANTEIL = 0.25

export interface GuenstigerpruefungEingaben {
  /** Einkünfte aus Kapitalvermögen (whole euros, non-negative). */
  readonly kapitalertraege: number
  /**
   * Die zvE-Basis der ÜBRIGEN Einkünfte (M1: Einnahmen-Basis aus `berechne`, Ebene 3 offen).
   * Whole euros, non-negative. 0 = nur Kapitalerträge erfasst.
   */
  readonly uebrigesZvE: number
  /** Der Veranlagungszeitraum — nur von tarif.ts veröffentlichte Jahre. */
  readonly year: number
  /** Einzelveranlagung (Grundtarif) oder Zusammenveranlagung (Splitting auf die kombinierte Basis). */
  readonly veranlagung: 'einzel' | 'zusammen'
  /** Der einzige ausgeschlossene Faktor, der das Ergebnis kippen kann (§ 32b EStG). */
  readonly progressionsvorbehalt: ProgressionsvorbehaltEingabe
  /** § 51a EStG-Faktor; 0 = keine Kirchensteuer (Standard, M1 erhebt sie noch nicht). */
  readonly kirchensteuerFaktor?: KirchensteuerFaktor
}

/**
 * Herkunfts-Metadaten an beiden Zahlen (Ticket-AC "ADR-0034-Muster"): beide tragen dieselben
 * Eingaben und Bestandteile — die Unschärfe steckt im `unschaerfe`-Feld. `uebrigesZvE` ist
 * ehrlich als zvE-Basis benannt (kein echtes zvE, Ebene 3 offen).
 */
export interface GuenstigerpruefungHerkunft {
  /** Die Kapitalerträge, auf ganze Euro — die Bemessungsgrundlage beider Zahlen. */
  readonly kapitalertraege: number
  /** Die übrige zvE-Basis (Einnahmen-Basis in M1), auf ganze Euro. */
  readonly uebrigesZvE: number
  /** Der angewendete Sparerpauschbetrag (§ 20 Abs. 9 EStG). */
  readonly sparerpauschbetrag: number
  /** Welche Veranlagungsart beide Zahlen rechnen. */
  readonly veranlagung: 'einzel' | 'zusammen'
  /** Die in `abgeltung` UND `persoenlich` eingefalteten Bestandteile. */
  readonly bestandteile: readonly TarifBestandteil[]
}

/**
 * ADR-0034 Entscheidung 2, auf die Günstigerprüfung übertragen — das Ergebnis, diskriminiert
 * über `aussage`. `empfehlung` existiert NUR auf `'eindeutig'`. Was ein Aufrufer aus jedem Feld
 * schließen darf (ADR-0034 §4, sinngemäß):
 *
 *   - `abgeltung`/`persoenlich`: die festgesetzte Steuer (Abgeltungsteuer + Soli + KiSt mit
 *     § 32d Abs. 1 Satz 4-Ermäßigung bzw. die tarifliche Steuerdifferenz) auf die EINGEGEBENEN
 *     Beträge, exakt auf den Euro — NICHT, dass diese Beträge das richtige zvE sind (Ebene 3).
 *   - `delta` (`persoenlich − abgeltung`): die exakte Differenz FÜR DIESE Eingaben — NICHT die
 *     tatsächliche Zahllast.
 *   - `eindeutig` + `empfehlung`: diese Besteuerung ist UM MEHR günstiger als der
 *     Progressionsvorbehalt das Ergebnis verschieben könnte — NICHT, dass sie um `delta`
 *     günstiger ist.
 *   - `zu-knapp`: die Differenz liegt innerhalb der Rauschgrenze des Nicht-Berechneten — NICHT,
 *     dass beide gleich sind.
 *   - `unbestimmt`: wir können die Fehlergrenze gar nicht messen — überhaupt nichts über den Sieger.
 */
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

/** Die tarifliche ESt auf eine kombinierte zvE-Basis, je Veranlagungsart (§ 32a Abs. 1/5). */
function tarifAufBasis(basis: number, veranlagung: 'einzel' | 'zusammen', year: IncomeTaxYear): number {
  if (veranlagung === 'einzel') return incomeTax(basis, year)
  // § 32a Abs. 5 Splitting: das Zweifache des Steuerbetrags für die Hälfte der kombinierten
  // Basis — splittingTarif(basis, 0) ist genau 2 × incomeTax(⌊(basis + 0) / 2⌋).
  return splittingTarif(basis, 0, year)
}

/** Die persönliche Steuer auf den Kapitalertrags-Anteil: tarifliche Steuer MIT minus OHNE Kapitalerträge. */
function persoenlicheSteuer(input: GuenstigerpruefungEingaben, year: IncomeTaxYear, faktor: KirchensteuerFaktor): number {
  const { kapitalertraege, uebrigesZvE, veranlagung } = input
  const freigrenze = veranlagung === 'einzel' ? soliFreigrenzen(year).einzel : soliFreigrenzen(year).zusammen

  const estMit = tarifAufBasis(uebrigesZvE + kapitalertraege, veranlagung, year)
  const estOhne = tarifAufBasis(uebrigesZvE, veranlagung, year)
  const estDifferenz = estMit - estOhne

  // Der Soli-Beitrag der Kapitalerträge ist die Differenz der beiden Soli (die Freigrenze macht
  // ihn nichtlinear — deshalb die Differenz, nie ein Zuschlag auf die Differenz).
  const soliDifferenz = solidaritaetszuschlag(estMit, freigrenze) - solidaritaetszuschlag(estOhne, freigrenze)
  const kist = kirchensteuer(estDifferenz, faktor)

  return estDifferenz + soliDifferenz + kist
}

/**
 * § 32d Abs. 6 EStG — die Günstigerprüfung: Abgeltungsteuer gegen die persönliche (tarifliche)
 * Steuer auf die Kapitalerträge, als bounded comparison (ADR-0034-Muster). `abgeltung`/
 * `persoenlich`/`delta` sind exakt GEGEBEN die Eingaben; `aussage` folgt ADR-0034: `eindeutig`
 * nur, wenn der Progressionsvorbehalt begrenzbar ist UND |delta| die Schranke übersteigt.
 */
export function guenstigerpruefung(input: GuenstigerpruefungEingaben): Guenstigerpruefung {
  validate(input)
  const { kapitalertraege, uebrigesZvE, veranlagung, progressionsvorbehalt } = input
  // Narrowing: ein nicht unterstütztes Jahr wirft, bevor irgendetwas rechnet (incomeTax/
  // splittingTarif prüfen es defensiv erneut — dieselbe Regel wie in tarif.ts).
  if (!isSupportedIncomeTaxYear(input.year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  }
  const year: IncomeTaxYear = input.year
  const faktor = input.kirchensteuerFaktor ?? 0

  // Abgeltungsteuer (§ 32d Abs. 1 Satz 1): 25 % auf Kapitalerträge minus Sparerpauschbetrag
  // (§ 20 Abs. 9 EStG), auf ganze Euro abgerundet.
  const sparerpauschbetrag = veranlagung === 'einzel' ? SPARERPAUSCHBETRAG_EINZEL : SPARERPAUSCHBETRAG_ZUSAMMEN
  const bemessung = Math.max(0, kapitalertraege - sparerpauschbetrag)
  const abgeltungESt = Math.floor(ABGELTUNGSSATZ * bemessung)

  // Soli (§ 4 SolZG) auf die Abgeltungsteuer, mit der Freigrenze der Veranlagungsart.
  const soliFreigrenze = veranlagung === 'einzel' ? soliFreigrenzen(year).einzel : soliFreigrenzen(year).zusammen
  const soliAbgeltung = solidaritaetszuschlag(abgeltungESt, soliFreigrenze)

  // KiSt mit der § 32d Abs. 1 Satz 4-Ermäßigung: die Abgeltungsteuer ermäßigt sich um 25 % der
  // auf die Kapitalerträge entfallenden Kirchensteuer.
  const kistAbgeltung = kirchensteuer(abgeltungESt, faktor)
  const ermaessigung = Math.floor(KIST_ERMAESSIGUNG_ANTEIL * kistAbgeltung)
  const abgeltung = abgeltungESt - ermaessigung + kistAbgeltung + soliAbgeltung

  const persoenlich = persoenlicheSteuer(input, year, faktor)

  // delta = persoenlich − abgeltung: positiv → Abgeltung günstiger, negativ → persönlich günstiger.
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

  // EINE Schranke-Definition, geteilt mit dem Veranlagungsartenvergleich (ADR-0034 Entscheidung 3).
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
