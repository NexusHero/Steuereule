export type IsoWochentag = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WOCHENTAGE: readonly IsoWochentag[] = [1, 2, 3, 4, 5, 6, 7]

export interface WerktageEingabe {
  readonly jahr: number
  readonly werktage: readonly IsoWochentag[]
  readonly urlaubstage: number
  readonly krankheitstage: number
  readonly homeofficeTage: number
}

export const PENDLERPAUSCHALE_PRO_KM = 0.3

export function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0
}

export function kalendertageImJahr(jahr: number): number {
  return istSchaltjahr(jahr) ? 366 : 365
}

function isoWochentagAm(jahr: number, tagIndex0: number): IsoWochentag {
  const utcTag = new Date(Date.UTC(jahr, 0, 1 + tagIndex0)).getUTCDay()
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

export function wochentageImJahr(jahr: number, werktage: readonly IsoWochentag[]): number {
  const set = new Set(werktage)
  let count = 0
  for (let d = 0; d < kalendertageImJahr(jahr); d++) {
    if (set.has(isoWochentagAm(jahr, d))) count++
  }
  return count
}

export type WerktageWiderspruch =
  | { readonly art: 'urlaub-krank-uebersteigt-wochentage'; readonly wochentage: number; readonly urlaubstage: number; readonly krankheitstage: number }
  | { readonly art: 'homeoffice-uebersteigt-werktage'; readonly werktage: number; readonly homeofficeTage: number }

export type WerktageErgebnis =
  | {
      readonly kind: 'bestimmt'
      readonly wochentage: number
      readonly werktage: number
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

export function pendlerpauschale(einfacheKm: number, pendlertage: number, satzProKm: number = PENDLERPAUSCHALE_PRO_KM): number {
  if (!Number.isFinite(einfacheKm) || einfacheKm < 0) throw new RangeError('einfacheKm must be a non-negative finite number')
  if (!Number.isInteger(pendlertage) || pendlertage < 0) throw new RangeError('pendlertage must be a non-negative integer')
  return Math.round(einfacheKm * pendlertage * satzProKm)
}
