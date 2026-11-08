import type { Item } from '../engine/berechnung'

export function adoptedLineItem(lineItem: Item, priorYear: number): Item {
  if (!Number.isInteger(priorYear) || priorYear < 0) {
    throw new RangeError(`adoptedLineItem: "${priorYear}" is not a valid year`)
  }
  return {
    ...lineItem,
    source: { kind: 'uebernahme', lastYear: priorYear },
    unconfirmed: true,
  }
}

export function confirmLineItem(lineItem: Item): Item {
  if (lineItem.unconfirmed !== true) return lineItem
  return { ...lineItem, unconfirmed: false }
}

export function adoptionProvenance(priorYear: number): string {
  if (!Number.isInteger(priorYear) || priorYear < 0) {
    throw new RangeError(`adoptionProvenance: "${priorYear}" is not a valid year`)
  }
  return `Übernahme aus ${priorYear}`
}
