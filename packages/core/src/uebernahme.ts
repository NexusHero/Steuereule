import type { Posten } from './berechnung'

export function uebernommenerPosten(posten: Posten, vorjahr: number): Posten {
  if (!Number.isInteger(vorjahr) || vorjahr < 0) {
    throw new RangeError(`uebernommenerPosten: "${vorjahr}" is not a valid year`)
  }
  return {
    ...posten,
    quelle: { art: 'uebernahme', vorjahr },
    unbestaetigt: true,
  }
}

export function bestaetigePosten(posten: Posten): Posten {
  if (posten.unbestaetigt !== true) return posten
  return { ...posten, unbestaetigt: false }
}

export function uebernahmeHerkunft(vorjahr: number): string {
  if (!Number.isInteger(vorjahr) || vorjahr < 0) {
    throw new RangeError(`uebernahmeHerkunft: "${vorjahr}" is not a valid year`)
  }
  return `Übernahme aus ${vorjahr}`
}
