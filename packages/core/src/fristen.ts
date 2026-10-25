// Ticket 10.7 (M6) — der Fristen-/Verspätungszuschlag-Warnmodus (§ 149 Abs. 2 AO Abgabefrist,
// § 152 AO Verspätungszuschlag). Two things live here:
// (1) the Abgabefrist je Steuerjahr as an EXPLICIT per-year table (Produkt-ADR-022: Jahresregel-
//     werke sind Backend-Konfiguration, die UI zeigt nie „aktuelle" Werte) — § 149 Abs. 2 AO:
//     31. Juli des Folgejahres (generell seit VZ 2018). A year outside the table WIRFT — never a
//     neighbour year's frist, never a guessed date. (2) the Warnmodus: a derived warning stage
//     (`keine` | `warnung` | `abgelaufen`) from whole days remaining. Per ADR-0039 there is NO
//     `verspätet` status — the missed frist stays `entwurf` + a warning banner; the stage is the
//     banner's honest input, never a tax status. The § 152 Abs. 2 AO figures (0,25 % pro
//     angefangenem Monat, mindestens 25 €) are cited constants the screen renders nüchtern
//     (Produkt-ADR-023: Fristen sind kritisch — präzise, keine Pointe, nie Schuld beim Nutzer).
//
// Pure, no I/O (ADR-0004). Dates are ISO yyyy-mm-dd, locale-independent UTC arithmetic (the same
// discipline as bescheid.ts's Einspruchsfrist) — the API owns the "heute" (Europe/Berlin), never
// the client clock.
//
// BEWUSSTE GRENZE (ehrlich benannt, kein halbes Feature): § 108 Abs. 3 AO (Fristende an Sa/So/
// Feiertag verschiebt sich auf den nächsten Werktag) ist NICHT hier — die Tabelle nennt das
// Kalenderdatum der Regelfrist; die § 108-Verschiebung ist ein benannter Follow-up, keine stille
// Näherung (dieselbe Feiertags-Grenze wie werktage.ts).
export const WARN_SCHWELLE_TAGE = 60

/** § 152 Abs. 2 Satz 2 AO — der Mindest-Verspätungszuschlag je angefangenem Monat. */
export const VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR = 25

/** § 152 Abs. 2 Satz 1 AO — 0,25 % der festgesetzten Steuer je angefangenem Monat der Verspätung. */
export const VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT = 0.25

// § 149 Abs. 2 AO — die Abgabefrist ist der 31. Juli des Folgejahres (generell seit VZ 2018).
// Regelwerk pro Jahr (Produkt-ADR-022): explizit, zitiert, nie aus „aktuellen" Werten abgeleitet.
const ABGABEFRISTEN: Readonly<Record<number, string>> = {
  2024: '2025-07-31',
  2025: '2026-07-31',
  2026: '2027-07-31',
}

/** Von diesem Modul veröffentlichte Steuerjahre — 2024/2025/2026 (aktuell + zwei Vorjahre). */
export type FristenJahr = 2024 | 2025 | 2026

/** Ist `jahr` ein von diesem Modul veröffentlichtes Steuerjahr? Nie `true` für ein geschätztes. */
export function istUnterstuetztesFristenJahr(jahr: number): jahr is FristenJahr {
  return Number.isInteger(jahr) && Object.prototype.hasOwnProperty.call(ABGABEFRISTEN, jahr)
}

/**
 * § 149 Abs. 2 AO — die Abgabefrist für ein unterstütztes Steuerjahr, als ISO yyyy-mm-dd.
 * Wirft für jedes nicht unterstützte Jahr — es fällt nie auf ein Nachbarjahr zurück (dieselbe
 * "throw, don't approximate"-Regel wie in tarif.ts).
 */
export function abgabefristFuer(steuerjahr: number): string {
  if (!istUnterstuetztesFristenJahr(steuerjahr)) {
    throw new RangeError(`Unsupported tax year for the Abgabefrist (§ 149 Abs. 2 AO): ${steuerjahr}`)
  }
  // Narrowed to FristenJahr above — the table has exactly those keys (never undefined).
  return ABGABEFRISTEN[steuerjahr]!
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whole days since the epoch for an ISO yyyy-mm-dd date — throws on malformed input. */
function tageSeit(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

/** Die Warnstufe (ADR-0039): keine | warnung (ab 60 Tage vor der Frist) | abgelaufen. */
export type FristenStufe = 'keine' | 'warnung' | 'abgelaufen'

/** Der ehrliche Fristen-Fakt für ein Steuerjahr an einem Stichtag — der Banner-Input, nie ein Status. */
export interface FristenWarnung {
  readonly stufe: FristenStufe
  /** Die Abgabefrist (§ 149 Abs. 2 AO), ISO yyyy-mm-dd. */
  readonly abgabefrist: string
  /** Whole days from `heute` (exclusive) to the frist. 0 = heute ist der Fristtag; negativ = abgelaufen. */
  readonly verbleibendeTage: number
}

/**
 * Der Warnmodus: `warnung` ab `WARN_SCHWELLE_TAGE` (60) Tagen vor der Abgabefrist, `abgelaufen`
 * sobald die Frist überschritten ist. Die verpasste Frist ist NUR diese Stufe + Banner — es gibt
 * keinen `verspätet`-Status (ADR-0039: ein technischer/zeitlicher Zustand darf nie wie ein
 * Steuer-Status aussehen). `heute` ist ISO yyyy-mm-dd und kommt vom Aufrufer (die API liefert
 * Europe/Berlin — nie die Client-Uhr).
 */
export function fristenWarnung(steuerjahr: number, heute: string): FristenWarnung {
  const abgabefrist = abgabefristFuer(steuerjahr)
  const verbleibendeTage = tageSeit(abgabefrist) - tageSeit(heute)
  const stufe: FristenStufe = verbleibendeTage < 0 ? 'abgelaufen' : verbleibendeTage <= WARN_SCHWELLE_TAGE ? 'warnung' : 'keine'
  return { stufe, abgabefrist, verbleibendeTage }
}
