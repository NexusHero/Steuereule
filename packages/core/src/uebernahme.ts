import type { Posten } from './berechnung'

export function adoptedLineItem(lineItem: Posten, priorYear: number): Posten {
  if (!Number.isInteger(priorYear) || priorYear < 0) {
    throw new RangeError(`adoptedLineItem: "${priorYear}" is not a valid year`)
  }
  return {
    ...lineItem,
    quelle: { art: 'uebernahme', vorjahr: priorYear },
    unbestaetigt: true,
  }
}

export function confirmLineItem(lineItem: Posten): Posten {
  if (lineItem.unbestaetigt !== true) return lineItem
  return { ...lineItem, unbestaetigt: false }
}

export function adoptionProvenance(priorYear: number): string {
  if (!Number.isInteger(priorYear) || priorYear < 0) {
    throw new RangeError(`adoptionProvenance: "${priorYear}" is not a valid year`)
  }
  return `Übernahme aus ${priorYear}`
}

// Backward-compatibility aliases
export {
  adoptedLineItem as uebernommenerPosten,
  confirmLineItem as bestaetigePosten,
  adoptionProvenance as uebernahmeHerkunft,
}
