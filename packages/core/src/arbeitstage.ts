// M4 — Arbeitstage-/Wegstrecken-Assistent (ticket 08). Calendar logic instead of free text:
// the user selects their work-week pattern and enters vacation/sick/home-office days; the core
// derives the commute-day count deterministically from the actual calendar (how many of each
// chosen weekday fall in that tax year), rather than trusting a hand-typed "220 Tage" figure that
// the old prototype collected (ADR-0031 §2's `tage`, and #337's exactness ruling this slice is
// the build-out of). Pure, deterministic, dependency-free (ADR-0004) — the only "calendar" here is
// the Gregorian weekday arithmetic, no locale/timezone (Date.UTC keeps it identical everywhere).
//
// The Pendlerpauschale here is *preparation*, not the full formula (berechnung.ts's header makes
// the same honesty call one level up): `pendlerpauschale` applies the § 9 Abs. 1 Nr. 4 EStG base
// rate (0,30 €/km/commute-day, whole euros) to the commute days, but the distance banding
// (0,38 € beyond 20 km) and any cap are later tariff-layer work and are deliberately NOT modelled
// here — the DATA (commute days × one-way km) is what this slice makes exact.

/** ISO weekday, 1 = Montag … 7 = Sonntag (unambiguous across locales, unlike Date.getDay's 0=Sun). */
export type IsoWochentag = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WOCHENTAGE: readonly IsoWochentag[] = [1, 2, 3, 4, 5, 6, 7]

export interface ArbeitstageEingabe {
  /** The tax year (Gregorian calendar year, e.g. 2026). */
  readonly jahr: number
  /** Which weekdays the person works (their work-week pattern). Non-empty. */
  readonly arbeitstage: readonly IsoWochentag[]
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

function validiere(eingabe: ArbeitstageEingabe): void {
  if (!Number.isInteger(eingabe.jahr) || eingabe.jahr < 2000 || eingabe.jahr > 2100) {
    throw new RangeError('jahr must be an integer calendar year between 2000 and 2100')
  }
  if (eingabe.arbeitstage.length === 0) {
    throw new RangeError('arbeitstage must name at least one weekday')
  }
  for (const tag of eingabe.arbeitstage) {
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

/** How many of the chosen weekdays fall in `jahr` — the deterministic "work days available". */
export function werktageImJahr(jahr: number, arbeitstage: readonly IsoWochentag[]): number {
  const set = new Set(arbeitstage)
  let count = 0
  for (let d = 0; d < kalendertageImJahr(jahr); d++) {
    if (set.has(isoWochentagAm(jahr, d))) count++
  }
  return count
}

/**
 * A contradiction in the entered calendar: more vacation/sick days than work days, or more
 * home-office days than the remaining worked days. Honest (ADR-008), never silently clamped.
 */
export type ArbeitstageWiderspruch =
  | { readonly art: 'urlaub-krank-uebersteigt-werktage'; readonly werktage: number; readonly urlaubstage: number; readonly krankheitstage: number }
  | { readonly art: 'homeoffice-uebersteigt-arbeitstage'; readonly arbeitstage: number; readonly homeofficeTage: number }

export type ArbeitstageErgebnis =
  | {
      readonly kind: 'bestimmt'
      readonly werktage: number
      /** Days actually worked (present or at home) = werktage − urlaub − krank. */
      readonly arbeitstage: number
      /** Days that involve the commute = arbeitstage − homeoffice. */
      readonly pendlertage: number
    }
  | { readonly kind: 'widerspruch'; readonly widerspruch: ArbeitstageWiderspruch }

export function berechneArbeitstage(eingabe: ArbeitstageEingabe): ArbeitstageErgebnis {
  validiere(eingabe)
  const werktage = werktageImJahr(eingabe.jahr, eingabe.arbeitstage)
  const arbeitstage = werktage - eingabe.urlaubstage - eingabe.krankheitstage
  if (arbeitstage < 0) {
    return {
      kind: 'widerspruch',
      widerspruch: {
        art: 'urlaub-krank-uebersteigt-werktage',
        werktage,
        urlaubstage: eingabe.urlaubstage,
        krankheitstage: eingabe.krankheitstage,
      },
    }
  }
  const pendlertage = arbeitstage - eingabe.homeofficeTage
  if (pendlertage < 0) {
    return {
      kind: 'widerspruch',
      widerspruch: { art: 'homeoffice-uebersteigt-arbeitstage', arbeitstage, homeofficeTage: eingabe.homeofficeTage },
    }
  }
  return { kind: 'bestimmt', werktage, arbeitstage, pendlertage }
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
