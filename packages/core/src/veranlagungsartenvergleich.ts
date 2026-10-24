// Ticket 10.2 (M1) — Veranlagungsartenvergleich: Einzel- vs. Zusammenveranlagung (§26/§26a/
// §26b) als bounded comparison. ADR-0034 (promotet) regelt den Vertrag dieses Moduls:
//
//   - Es gibt NIE ein nacktes Urteil. `empfehlung` existiert NUR in der `eindeutig`-Variante —
//     nicht optional, nicht nullable, kein Top-Level-Feld neben einer ignorierbaren Konfidenz.
//     Wer das Urteil will, muss zuerst `aussage` lesen; der Compiler verweigert die Abkürzung.
//   - `unschaerfe` ist die berechnete Schranke dafür, wie weit die AUSGESCHLOSSENEN Faktoren
//     `delta` verschieben könnten — nie eine aus dem Gefühl gewählte Schwelle.
//
// NAMENS-DISZIPLIN (ADR-0034 §1): "Günstigerprüfung" ist für §32d Abs. 6 EStG reserviert
// (Ticket 10.5). Dieses Modul heißt Veranlagungsartenvergleich, in Code, Tests und Prosa.
//
// VERFEINERUNG GEGENÜBER ADR-0034 (bewusst, und im Kopf dokumentiert): ADR-0034 ließ
// Solidaritätszuschlag und Kirchensteuer UNBERECHNET und modellierte sie als (berechenbare)
// Schranke in `unschaerfe`. Dieses Ticket BERECHNET sie (tarif.ts), sodass `einzel`/`zusammen`/
// `delta` die VOLLE festgesetzte Steuer (ESt + Soli + KiSt) tragen und die verbleibende
// Unschärfe ausschließlich der Progressionsvorbehalt (§32b EStG) ist — der einzige ausgeschlossene
// Faktor, der das Ergebnis KIPPEN kann (Soli/KiSt sind monotone Zuschläge auf die ESt und können
// das Vorzeichen von `delta` nicht drehen). `aussage === 'eindeutig'` genau dann, wenn
// `unschaerfe.kind === 'bestimmt' && |delta| > unschaerfe.obergrenze` (ADR-0034 Entscheidung 3).
//
// EBENE 3 BLEIBT OFFEN (ADR-0034 §4): dieses Modul behauptet nichts über die Richtigkeit des
// EINGEGEBENEN zvE. `zveA`/`zveB` sind im M1-Slice eine Einnahmen-BASIS (aus `berechne`), noch
// kein echtes zu versteuerndes Einkommen (Werbungskosten/Sonderausgaben/Vorsorge fehlen) — das
// trägt `herkunft` ehrlich mit.
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

/**
 * Die Eingabe für den Progressionsvorbehalt (§32b EStG) — der einzige ausgeschlossene Faktor,
 * der den Vergleich kippen kann. Er ist NICHT aus zvE allein schätzbar (ADR-0034 Entscheidung 3):
 * beliebige Lohnersatzleistungen verschieben ihn beliebig. Ohne Angabe ist `unschaerfe` daher
 * `unbestimmt` und `aussage` kann nie `eindeutig` werden.
 */
export type ProgressionsvorbehaltEingabe =
  | { readonly art: 'keine' }
  | { readonly art: 'lohnersatzleistungen'; readonly betrag: number }
  | { readonly art: 'nicht-angegeben' }

/**
 * ADR-0034 Entscheidung 3 — die Schranke, wie weit die ausgeschlossenen Faktoren `delta`
 * verschieben könnten. `bestimmt` (mit `obergrenze` in ganzen Euro) nur, wenn der
 * Progressionsvorbehalt begrenzbar ist; andernfalls `unbestimmt` und kein Urteil möglich.
 */
export type Unschaerfe =
  | { readonly kind: 'bestimmt'; readonly obergrenze: number }
  | { readonly kind: 'unbestimmt'; readonly grund: 'progressionsvorbehalt-nicht-eingegeben' }

/** Welche Steuerbestandteile in beide Zahlen eingefaltet sind. */
export type TarifBestandteil = 'einkommensteuer' | 'solidaritaetszuschlag' | 'kirchensteuer'

/**
 * Herkunfts-Metadaten an beiden Zahlen (Ticket-AC: "Herkunfts-/Unschärfe-Metadaten"). Beide
 * Zahlen teilen dieselben zvE-Eingaben und dieselben Bestandteile — nur die Veranlagungsart
 * unterscheidet sie (zwei Grundtarife vs. Splitting). Die Unschärfe steckt im `unschaerfe`-Feld.
 */
export interface VergleichsHerkunft {
  /** Die zwei zvE-Basen (M1: Einnahmen aus `berechne` — Ebene 3 bleibt offen, kein echtes zvE). */
  readonly zveA: number
  readonly zveB: number
  /** Die in `einzel` UND `zusammen` eingefalteten Bestandteile. */
  readonly bestandteile: readonly TarifBestandteil[]
}

/**
 * ADR-0034 Entscheidung 2 — das Ergebnis, diskriminiert über `aussage`. `empfehlung` existiert
 * NUR auf `'eindeutig'`. Was ein Aufrufer aus jedem Feld schließen darf (ADR-0034 §4, sinngemäß):
 *
 *   - `einzel`/`zusammen`: die festgesetzte Steuer (ESt + Soli + KiSt) auf die zwei zvE-Basen,
 *     exakt auf den Euro — NICHT, dass diese zvE-Basen das richtige zvE sind (Ebene 3 offen).
 *   - `delta`: die exakte Tarifdifferenz FÜR DIESE zvE-Basen — NICHT die tatsächliche Zahllast.
 *   - `eindeutig` + `empfehlung`: diese Veranlagungsart gewinnt UM MEHR als die ausgeschlossenen
 *     Faktoren sie verschieben könnten — NICHT, dass sie um `delta` gewinnt.
 *   - `zu-knapp`: die Differenz liegt innerhalb der Rauschgrenze des Nicht-Berechneten — NICHT,
 *     dass beide gleich sind.
 *   - `unbestimmt`: wir können die Fehlergrenze gar nicht messen — überhaupt nichts über den Sieger.
 */
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
  /** §51a EStG-Faktor; 0 = keine Kirchensteuer (Standard, M1 erhebt sie noch nicht). */
  readonly kirchensteuerFaktor?: KirchensteuerFaktor
}

/** §32a Abs. 1 Nr. 5 — der Spitzengrenzsteuersatz, die obere Schranke des Progressionsvorbehalts. */
const MAX_GRENZSTEUERSATZ = 0.45

function progressionsvorbehaltSchranke(pv: ProgressionsvorbehaltEingabe): Unschaerfe {
  switch (pv.art) {
    case 'keine':
      return { kind: 'bestimmt', obergrenze: 0 }
    case 'lohnersatzleistungen': {
      if (!Number.isFinite(pv.betrag) || pv.betrag < 0) {
        throw new RangeError('lohnersatzleistungen betrag must be a non-negative finite number')
      }
      // §32b EStG: der Progressionsvorbehalt erhöht die Steuer höchstens um den
      // Spitzengrenzsteuersatz (45 %) mal den Lohnersatzleistungen — eine konservative, zitierbare
      // OBERgrenze (aufgerundet), keine aus dem Gefühl gewählte Schwelle.
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

/**
 * Veranlagungsartenvergleich (§26/§26a/§26b): Zusammen- (Splittingtarif) gegen
 * Einzelveranlagung (zwei Grundtarife), für die zvE-Basen `zveA`/`zveB` im Jahr `year`.
 *
 * `einzel`/`zusammen`/`delta` sind exakt GEGEBEN `zveA`/`zveB` (Ebene 2) und tragen die VOLLE
 * festgesetzte Steuer (ESt + Soli + KiSt). `aussage` folgt ADR-0034: `eindeutig` nur, wenn der
 * Progressionsvorbehalt begrenzbar ist UND `|delta|` die Schranke übersteigt.
 */
export function veranlagungsartenvergleich(input: VeranlagungsartenvergleichEingaben): Veranlagungsartenvergleich {
  validate(input)
  const { zveA, zveB, progressionsvorbehalt } = input
  // Narrowing: ein nicht unterstütztes Jahr wirft, bevor irgendetwas rechnet — dieselbe
  // "throw, don't approximate"-Regel wie in tarif.ts (incomeTax/splittingTarif prüfen es defensiv erneut).
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
