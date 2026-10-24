// M4 — Werktage-/Wegstrecken-Assistent (ticket 08). Calendar logic instead of free text: the user
// selects their work-week pattern and enters vacation/sick/home-office days; the core derives the
// weekday/commute-day count deterministically from the actual calendar (how many of each chosen
// weekday fall in that tax year), rather than trusting a hand-typed "220 Tage" figure that the old
// prototype collected (ADR-0031 §2's `tage`, and #337's exactness ruling this slice is the build-out
// of). Pure, deterministic, dependency-free (ADR-0004) — the only "calendar" here is the Gregorian
// weekday arithmetic, no locale/timezone (Date.UTC keeps it identical everywhere).
//
// HONESTY BOUNDARY — gesetzliche Feiertage are NOT subtracted (ADR-0032: never promise more than
// the slice delivers). A public holiday that falls on a work day reduces the real Pendlertage, but
// that subtraction needs a Feiertagskalender (bundeslandabhängig), which is a LATER slice. The
// figures below are therefore named `werktage`/`pendlertage` — "vor Feiertagen" — not `arbeitstage`:
// `werktage = wochentage − urlaub − krank` and `pendlertage = werktage − homeoffice` are an upper
// bound, exact only up to the number of work-day holidays in the year. The Pendlerpauschale built on
// them is correspondingly an upper bound until the Feiertagskalender slice lands.
//
// The Pendlerpauschale here is *preparation*, not the full formula (berechnung.ts's header makes the
// same honesty call one level up): `pendlerpauschale` applies the § 9 Abs. 1 Nr. 4 EStG base rate
// (0,30 €/km/commute-day, whole euros) to the commute days, but the distance banding (0,38 € beyond
// 20 km) and any cap are later tariff-layer work and are deliberately NOT modelled here — the DATA
// (commute days × one-way km) is what this slice makes exact (up to the Feiertage boundary above).

/** ISO weekday, 1 = Montag … 7 = Sonntag (unambiguous across locales, unlike Date.getDay's 0=Sun). */
export type IsoWochentag = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WOCHENTAGE: readonly IsoWochentag[] = [1, 2, 3, 4, 5, 6, 7]

export interface WerktageEingabe {
  /** The tax year (Gregorian calendar year, e.g. 2026). */
  readonly jahr: number
  /** Which weekdays the person works (their work-week pattern). Non-empty. */
  readonly werktage: readonly IsoWochentag[]
  /** Vacation days taken (>= 0) — days NOT worked and NOT commuted. */
  readonly urlaubstage: number
  /** Sick days (>= 0) — days NOT worked and NOT commuted. */
  readonly krankheitstage: number
  /** Home-office days (>= 0) — days worked but NOT commuted. */
  readonly homeofficeTage: number
}

/** § 9 Abs. 1 Nr. 4 EStG base rate, in euro per km per commute-day. */
export const PENDLERPAUSCHALE_PRO_KM = 0.3

export function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0
}

export function kalendertageImJahr(jahr: number): number {
  return istSchaltjahr(jahr) ? 366 : 365
}

/** ISO weekday of the (0-indexed) day of the year, via UTC so the result is locale-independent. */
function isoWochentagAm(jahr: number, tagIndex0: number): IsoWochentag {
  const utcTag = new Date(Date.UTC(jahr, 0, 1 + tagIndex0)).getUTCDay() // 0=Sun … 6=Sat
  return (utcTag === 0 ? 7 : utcTag) as IsoWochentag
}

function validiere(eingabe: WerktageEingabe): void {
  if (!Number.isInteger(eingabe.jahr) || eingabe.jahr < 2000 || eingabe.jahr > 2100) {
    throw new RangeError('jahr must be an integer calendar year between 2000 and 2100')
  }
  if (eingabe.werktage.length === 0) {
    throw new RangeError('werktage must name at least one weekday')
  }
  for (const tag of eingabe.werktage) {
    if (!WOCHENTAGE.includes(tag)) throw new RangeError(`"${tag}" is not an ISO weekday (1-7)`)
  }
  for (const [name, n] of [
    ['urlaubstage', eingabe.urlaubstage],
    ['krankheitstage', eingabe.krankheitstage],
    ['homeofficeTage', eingabe.homeofficeTage],
  ] as const) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
}

/**
 * How many of the chosen weekdays fall in `jahr` — the deterministic "work weekdays available".
 * Still INCLUDES any gesetzliche Feiertage that fall on those weekdays (see the header boundary).
 */
export function wochentageImJahr(jahr: number, werktage: readonly IsoWochentag[]): number {
  const set = new Set(werktage)
  let count = 0
  for (let d = 0; d < kalendertageImJahr(jahr); d++) {
    if (set.has(isoWochentagAm(jahr, d))) count++
  }
  return count
}

/**
 * A contradiction in the entered calendar: more vacation/sick days than the chosen weekdays, or more
 * home-office days than the remaining worked weekdays. Honest (ADR-008), never silently clamped.
 */
export type WerktageWiderspruch =
  | { readonly art: 'urlaub-krank-uebersteigt-wochentage'; readonly wochentage: number; readonly urlaubstage: number; readonly krankheitstage: number }
  | { readonly art: 'homeoffice-uebersteigt-werktage'; readonly werktage: number; readonly homeofficeTage: number }

export type WerktageErgebnis =
  | {
      readonly kind: 'bestimmt'
      /** Chosen weekdays in `jahr` (still including gesetzliche Feiertage). */
      readonly wochentage: number
      /** Working weekdays after vacation/sick, BEFORE Feiertagsabzug = wochentage − urlaub − krank. */
      readonly werktage: number
      /** Days that involve the commute, BEFORE Feiertagsabzug = werktage − homeoffice. */
      readonly pendlertage: number
    }
  | { readonly kind: 'widerspruch'; readonly widerspruch: WerktageWiderspruch }

export function berechneWerktage(eingabe: WerktageEingabe): WerktageErgebnis {
  validiere(eingabe)
  const wochentage = wochentageImJahr(eingabe.jahr, eingabe.werktage)
  const werktage = wochentage - eingabe.urlaubstage - eingabe.krankheitstage
  if (werktage < 0) {
    return {
      kind: 'widerspruch',
      widerspruch: {
        art: 'urlaub-krank-uebersteigt-wochentage',
        wochentage,
        urlaubstage: eingabe.urlaubstage,
        krankheitstage: eingabe.krankheitstage,
      },
    }
  }
  const pendlertage = werktage - eingabe.homeofficeTage
  if (pendlertage < 0) {
    return {
      kind: 'widerspruch',
      widerspruch: { art: 'homeoffice-uebersteigt-werktage', werktage, homeofficeTage: eingabe.homeofficeTage },
    }
  }
  return { kind: 'bestimmt', wochentage, werktage, pendlertage }
}

/**
 * Pendlerpauschale (preparation): one-way km × commute-days × the § 9 base rate, in whole euros.
 * The distance banding and any cap are later slices (see the header). `satzProKm` is injectable
 * only so tests can exercise rounding without asserting the legal rate itself is configurable.
 */
export function pendlerpauschale(einfacheKm: number, pendlertage: number, satzProKm: number = PENDLERPAUSCHALE_PRO_KM): number {
  if (!Number.isFinite(einfacheKm) || einfacheKm < 0) throw new RangeError('einfacheKm must be a non-negative finite number')
  if (!Number.isInteger(pendlertage) || pendlertage < 0) throw new RangeError('pendlertage must be a non-negative integer')
  return Math.round(einfacheKm * pendlertage * satzProKm)
}
