// Ticket 10.2 (M1) — das Tarif-Modul: §32a EStG Einkommensteuer-Tarif (`incomeTax`),
// Solidaritätszuschlag (§4 SolZG) und Kirchensteuer-Faktor (§51a EStG). Deterministisch,
// dependency-frei (ADR-0004): `packages/core` bleibt die EINZIGE Quelle jeder Zahl, die die
// App zeigt (ADR-014/048) — der LLM rechnet nie, nur dieses Modul (und seine Tests) tun das.
//
// Die drei Genauigkeitsebenen aus ADR-0034 (und der tarif.ts-Vorlage aus #340/kaan/321):
//
//   1. `incomeTax(zvE, year)` ist EXAKT für ein gegebenes zvE — §32a Abs. 1 EStG ist eine
//      geschlossene stückweise Formel. Die Rundungsregel gehört zum Rechtsvertrag, nicht zur
//      Implementierung: das zvE wird VOR der Formel auf volle Euro ABGERUNDET (§32a Abs. 1
//      Satz 1) und der Steuerbetrag NACH der Formel (§32a Abs. 1 Satz 6). Beides weglassen ist,
//      wie zwei "korrekte" Implementierungen um einen Euro auseinanderlaufen.
//   2. Der Veranlagungsartenvergleich (veranlagungsartenvergleich.ts) ist EXAKT GEGEBEN zwei
//      zvE-Werte: Splitting (§32a Abs. 5) als `2 × incomeTax(⌊(zvE_A+zvE_B)/2⌋)` gegen zwei
//      Grundtarif-Aufrufe. Was er NICHT behauptet, ist das Urteil — das ist ADR-0034.
//   3. KEINE dieser Ebenen sagt etwas über die Richtigkeit des EINGEGEBENEN zvE. Dieses Modul
//      liefert bewusst keines (ADR-0034 "layer 3" bleibt offen): ein exakter Tarif über einer
//      groben Eingabe wirkt gerade WEIL er präzise ist autoritativ.
//
// NAMENS-DISZIPLIN (ADR-0034 §1): "Günstigerprüfung" ist reserviert für §32d Abs. 6 EStG
// (Kapitalerträge, Ticket 10.5). Dieses Modul heißt — in Code, Tests und Prosa — ausschließlich
// "Veranlagungsartenvergleich" (§26/§26a/§26b). Das Wort "Günstigerprüfung" taucht hier NICHT auf.
//
// QUELLEN (bewusst zitiert, keine ausgedachten Konstanten):
//   - §32a Abs. 1 EStG — Grundtarif, Koefizienten je Veranlagungszeitraum. 2024: BGBl 2024 I
//     Nr. 386 (Gesetz zur steuerlichen Freistellung des Existenzminimums 2024, rückwirkend zum
//     1.1.2024); 2025: Steuerfortentwicklungsgesetz (BGBl 2024 I Nr. 449); 2026: gesetze-im-
//     internet.de/estg/__32a.html. Die 2024-Werte sind die RÜCKWIRKENDE Fassung (Grundfreibetrag
//     11.784 €, nicht die vorläufigen 11.604 €) — die amtliche EStH 2024 bestätigt sie.
//   - §32a Abs. 5 EStG — Splitting-Verfahren (das Zweifache des Steuerbetrags für die Hälfte
//     des gemeinsam zu versteuernden Einkommens).
//   - §4 SolZG 1995 — Solidaritätszuschlag 5,5 % der Bemessungsgrundlage; Satz 2 (Milderungszone)
//     deckelt auf 11,9 % des (Bemessungsgrundlage − Freigrenze)-Unterschiedsbetrags. Freigrenzen
//     §3 Abs. 3 SolZG (2024: 18.130/36.260, 2025: 19.950/39.900, 2026: 20.350/40.700 €).
//   - §51a EStG — Kirchensteuer 8 % (Bayern, Baden-Württemberg) bzw. 9 % (übrige Länder) der
//     Einkommensteuer. Der Satz ist ein FAKTOR-Eingang des Aufrufers (Konfession/Bundesland),
//     keine hier ausgedachte Konstante.
//
// EXPLIZIT NICHT ABGEDECKT (ehrliche Grenzen, ADR-0034 Regel 3):
//   - Progressionsvorbehalt (§32b EStG) — NICHT in diesem Modul. Er ist der einzige ausgeschlossene
//     Faktor, der den Veranlagungsartenvergleich KIPPEN kann (er ändert den Steuersatz, nicht nur
//     einen monotonen Zuschlag). veranlagungsartenvergleich.ts modelliert ihn als `unschaerfe`.
//   - Verwitwetentarif (§32a Abs. 6) und alle Splitting-Randfälle jenseits von Abs. 5 — NICHT hier.
//   - Kirchensteuer-Kappung/Höchstbetrag und die Kapitalertragsteuer-Sonderfälle (§32d) — NICHT hier.
//
// Ein nicht unterstütztes Steuerjahr WIRFT — es fällt nie auf die Koeffizienten eines Nachbarjahres
// zurück (dieselbe "throw, don't approximate"-Regel wie die Existenzprüfung in kaan/321's Vorlage).

/** Von diesem Modul veröffentlichte §32a-Koeffizienten — 2024/2025/2026 (aktuell + zwei Vorjahre). */
export type IncomeTaxYear = 2024 | 2025 | 2026

interface TariffCoefficients {
  /** Grundfreibetrag, in ganzen Euro. zvE darunter ist steuerfrei. */
  readonly grundfreibetrag: number
  /** Zone 2 (erste Progressionskurve) Obergrenze und `y`-Formel-Koeffizienten. */
  readonly zone2Upper: number
  readonly zone2C1: number
  readonly zone2C2: number
  /** Zone 3 (zweite Progressionskurve) Obergrenze, `z`-Formel-Koeffizienten und Konstante. */
  readonly zone3Upper: number
  readonly zone3C1: number
  readonly zone3C2: number
  readonly zone3Const: number
  /** Zone 4 (linear 42 %) Obergrenze und Formel. Darüber Zone 5 ("Reichensteuer" 45 %). */
  readonly zone4Upper: number
  readonly zone4Rate: number
  readonly zone4Sub: number
  /** Zone 5 (linear 45 %), gilt für zvE oberhalb von `zone4Upper`. */
  readonly zone5Rate: number
  readonly zone5Sub: number
}

// §32a Abs. 1 EStG — Grundtarif-Koeffizienten je Veranlagungszeitraum. Quellen siehe Kopf.
const TAX_YEARS: Readonly<Record<IncomeTaxYear, TariffCoefficients>> = {
  // BGBl 2024 I Nr. 386 — rückwirkend zum 1.1.2024 (EStH 2024).
  2024: {
    grundfreibetrag: 11784,
    zone2Upper: 17005,
    zone2C1: 954.8,
    zone2C2: 1400,
    zone3Upper: 66760,
    zone3C1: 181.19,
    zone3C2: 2397,
    zone3Const: 991.21,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10636.31,
    zone5Rate: 0.45,
    zone5Sub: 18971.06,
  },
  // Steuerfortentwicklungsgesetz, BGBl 2024 I Nr. 449 (LStH 2025).
  2025: {
    grundfreibetrag: 12096,
    zone2Upper: 17443,
    zone2C1: 932.3,
    zone2C2: 1400,
    zone3Upper: 68480,
    zone3C1: 176.64,
    zone3C2: 2397,
    zone3Const: 1015.13,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10911.92,
    zone5Rate: 0.45,
    zone5Sub: 19246.67,
  },
  // gesetze-im-internet.de/estg/__32a.html (VZ 2026).
  2026: {
    grundfreibetrag: 12348,
    zone2Upper: 17799,
    zone2C1: 914.51,
    zone2C2: 1400,
    zone3Upper: 69878,
    zone3C1: 173.1,
    zone3C2: 2397,
    zone3Const: 1034.87,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 11135.63,
    zone5Rate: 0.45,
    zone5Sub: 19470.38,
  },
}

/** Solidaritätszuschlag-Freigrenzen (§3 Abs. 3 SolZG) je Jahr: Einzel- / Zusammenveranlagung. */
export interface SoliFreigrenzen {
  readonly einzel: number
  readonly zusammen: number
}

// §3 Abs. 3 SolZG: 2024 18.130/36.260 (BGBl 2024 I Nr. 386), 2025 19.950/39.900 und
// 2026 20.350/40.700 (SteFeG, BGBl 2024 I Nr. 449).
const SOLI_FREIGRENZEN: Readonly<Record<IncomeTaxYear, SoliFreigrenzen>> = {
  2024: { einzel: 18130, zusammen: 36260 },
  2025: { einzel: 19950, zusammen: 39900 },
  2026: { einzel: 20350, zusammen: 40700 },
}

/** §4 SolZG Satz 1 — der Zuschlagsatz. */
const SOLI_RATE = 0.055
/** §4 SolZG Satz 2 — Deckel der Milderungszone (seit VZ 2021 11,9 %, vorher 20 %). */
const SOLI_MILDERUNG_RATE = 0.119

/** §51a EStG — zulässige Kirchensteuer-Faktoren (8 % Bayern/BaWü, 9 % übrige, 0 = keine). */
export type KirchensteuerFaktor = 0 | 0.08 | 0.09

/** §3 Abs. 3 SolZG-Freigrenzen für ein unterstütztes Jahr — die EINE Quelle, kein Duplikat im Aufrufer. */
export function soliFreigrenzen(year: IncomeTaxYear): SoliFreigrenzen {
  return SOLI_FREIGRENZEN[year]
}

/**
 * Ist `year` ein von diesem Modul veröffentlichtes Steuerjahr? Nie `true` für ein Jahr, das es
 * nur schätzen könnte. `Number.isInteger` ist gefordert, nicht dekorativ: die `TAX_YEARS`-Keys
 * sind Objekt-Property-Strings, `hasOwnProperty` allein würde auch den STRING `'2024'` als
 * unterstützt behandeln — genau die untypisierte Grenze, die diese Existenzprüfung halten soll,
 * da `year` aus Pfad-/Query-Parametern als String ankommen kann.
 */
export function isSupportedIncomeTaxYear(year: number): year is IncomeTaxYear {
  return Number.isInteger(year) && Object.prototype.hasOwnProperty.call(TAX_YEARS, year)
}

/** Die zvE-Zonengrenzen (2/3/4) eines Jahres aufsteigend: `[zone2Upper, zone3Upper, zone4Upper]`. */
export function zoneBoundaries(year: IncomeTaxYear): readonly [number, number, number] {
  const c = TAX_YEARS[year]
  return [c.zone2Upper, c.zone3Upper, c.zone4Upper]
}

function grundtarif(zvE: number, c: TariffCoefficients): number {
  if (zvE <= c.grundfreibetrag) return 0
  if (zvE <= c.zone2Upper) {
    const y = (zvE - c.grundfreibetrag) / 10000
    return (c.zone2C1 * y + c.zone2C2) * y
  }
  if (zvE <= c.zone3Upper) {
    const z = (zvE - c.zone2Upper) / 10000
    return (c.zone3C1 * z + c.zone3C2) * z + c.zone3Const
  }
  if (zvE <= c.zone4Upper) {
    return c.zone4Rate * zvE - c.zone4Sub
  }
  return c.zone5Rate * zvE - c.zone5Sub
}

/**
 * §32a Abs. 1 EStG Grundtarif: die Einkommensteuer auf `zuVersteuerndesEinkommen` für `year`,
 * auf ganze Euro abgerundet (§32a Abs. 1 Satz 6). Exakt für ein unterstütztes Jahr (Ebene 1).
 * Wirft für negatives/nicht-endliches zvE und für jedes nicht unterstützte Jahr — sie rechnet
 * nie gegen das nächste unterstützte Jahr.
 */
export function incomeTax(zuVersteuerndesEinkommen: number, year: number): number {
  if (!Number.isFinite(zuVersteuerndesEinkommen)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zuVersteuerndesEinkommen < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }

  // §32a Abs. 1 Satz 1: zvE wird VOR der Formel auf volle Euro abgerundet.
  const zvE = Math.floor(zuVersteuerndesEinkommen)
  // §32a Abs. 1 Satz 6: der Steuerbetrag wird NACH der Formel auf volle Euro abgerundet.
  return Math.floor(grundtarif(zvE, TAX_YEARS[year]))
}

/**
 * §32a Abs. 5 EStG (Splitting-Verfahren): das Zweifache des Steuerbetrags für die Hälfte des
 * gemeinsam zu versteuernden Einkommens. `zusammen` im Veranlagungsartenvergleich ist genau das.
 * Exakt für ein unterstütztes Jahr; dieselben Werteprüfungen wie `incomeTax`.
 */
export function splittingTarif(zveA: number, zveB: number, year: number): number {
  if (!Number.isFinite(zveA) || !Number.isFinite(zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zveA < 0 || zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }
  const haelfte = Math.floor((zveA + zveB) / 2)
  return 2 * incomeTax(haelfte, year)
}

/**
 * §4 SolZG 1995 — Solidaritätszuschlag auf eine Bemessungsgrundlage (veranlagte Einkommensteuer),
 * mit Freigrenze (§3 Abs. 3) und Milderungszone (§4 Satz 2). `freigrenze` kommt aus
 * `SOLI_FREIGRENZEN` je nach Veranlagungsart (einzel/zusammen) und Jahr — der Aufrufer wählt,
 * damit die Freigrenzen-Skalierung (zusammen = 2 × einzel) nicht still in einer Funktion
 * verschwindet. Ergebnis auf ganze Euro abgerundet (ganzzahlig, wie der Rest des Kerns).
 *
 * Milderungszone: §4 Satz 2 deckelt den Zuschlag auf 11,9 % des (Bemessungsgrundlage − Freigrenze)-
 * Unterschiedsbetrags, damit beim Überschreiten der Freigrenze kein Belastungssprung entsteht.
 */
export function solidaritaetszuschlag(bemessungsgrundlage: number, freigrenze: number): number {
  if (!Number.isFinite(bemessungsgrundlage) || !Number.isFinite(freigrenze)) {
    throw new RangeError('bemessungsgrundlage and freigrenze must be finite numbers')
  }
  if (bemessungsgrundlage < 0 || freigrenze < 0) {
    throw new RangeError('bemessungsgrundlage and freigrenze must not be negative')
  }
  const base = Math.floor(bemessungsgrundlage)
  if (base <= freigrenze) return 0
  const voll = SOLI_RATE * base
  const gemildert = SOLI_MILDERUNG_RATE * (base - freigrenze)
  return Math.floor(Math.min(voll, gemildert))
}

/**
 * §51a EStG — Kirchensteuer als Faktor der Einkommensteuer. `faktor` ist ein Aufrufer-Eingang
 * (0 = keine, 0.08 = Bayern/BaWü, 0.09 = übrige Länder) — keine hier erfundene Konstante. Ergebnis
 * auf ganze Euro abgerundet.
 */
export function kirchensteuer(einkommensteuer: number, faktor: KirchensteuerFaktor): number {
  if (!Number.isFinite(einkommensteuer) || einkommensteuer < 0) {
    throw new RangeError('einkommensteuer must be a non-negative finite number')
  }
  if (faktor !== 0 && faktor !== 0.08 && faktor !== 0.09) {
    throw new RangeError('faktor must be one of 0, 0.08, 0.09')
  }
  return Math.floor(einkommensteuer * faktor)
}
