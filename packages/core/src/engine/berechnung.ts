import type { IncomeType } from '../domains/income-types'
export type Source =
  | { readonly kind: 'eingabe' }
  | { readonly kind: 'beleg'; readonly receiptId: string }
  | { readonly kind: 'ki-vorschlag'; readonly proposalId: string; readonly receiptId?: string }
  | { readonly kind: 'regel'; readonly rule: string }
  | { readonly kind: 'uebernahme'; readonly lastYear: number }
export type Role = 'einnahme' | 'vorsorgeaufwand' | 'anrechnung'

export interface Item {
  readonly id: string
  readonly incomeType: IncomeType
  readonly role?: Role
  readonly amount: number
  readonly source: Source
  readonly unconfirmed?: boolean
}

/** A LineItem / Posten with conflicting sources. */
export interface ItemConflict {
  readonly itemId: string
  readonly incomeType: IncomeType
  readonly sources: readonly (Source & { readonly amount: number })[]
}

export interface CalculationInput {
  readonly items: readonly Item[]
  readonly openItems: number
  readonly conflicts: readonly ItemConflict[]
  readonly gated: readonly IncomeType[]
}

export type CalculationStatus =
  | {
      readonly kind: 'bestimmt'
      readonly einnahmen: number
      readonly vorsorgeaufwand: number
      readonly anrechnung: number
    }
  | {
      readonly kind: 'offen'
      readonly einnahmen: number
      readonly vorsorgeaufwand: number
      readonly anrechnung: number
      readonly openItems: number
      readonly conflicts: number
      readonly gated: readonly IncomeType[]
      readonly unconfirmedItems: number
      readonly unconfirmedSum: number
    }

function validate(input: CalculationInput): void {
  if (!Number.isInteger(input.openItems) || input.openItems < 0) {
    throw new RangeError('offenePosten must be a non-negative integer')
  }
  for (const items of input.items) {
    if (!Number.isFinite(items.amount) || items.amount < 0) {
      throw new RangeError('posten.betrag must be a non-negative finite number')
    }
  }
}

function roleOf(items: Item): Role {
  return items.role ?? 'einnahme'
}

export function calculate(input: CalculationInput): CalculationStatus {
  validate(input)
  let einnahmen = 0
  let vorsorgeaufwand = 0
  let anrechnung = 0
  let unconfirmedItems = 0
  let unconfirmedSum = 0
  for (const items of input.items) {
    switch (roleOf(items)) {
      case 'einnahme':
        einnahmen += items.amount
        break
      case 'vorsorgeaufwand':
        vorsorgeaufwand += items.amount
        break
      case 'anrechnung':
        anrechnung += items.amount
        break
    }
    if (items.unconfirmed === true) {
      unconfirmedItems += 1
      if (roleOf(items) === 'einnahme') unconfirmedSum += items.amount
    }
  }

  const open =
    input.openItems > 0 ||
    input.conflicts.length > 0 ||
    input.gated.length > 0 ||
    unconfirmedItems > 0

  if (!open) {
    return { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
  }

  return {
    kind: 'offen',
    einnahmen,
    vorsorgeaufwand,
    anrechnung,
    openItems: input.openItems,
    conflicts: input.conflicts.length,
    gated: input.gated,
    unconfirmedItems,
    unconfirmedSum,
  }
}

export type ConflictResolution =
  | { readonly kind: 'quelle-waehlen'; readonly source: Source; readonly amount: number }
  | { readonly kind: 'wert-korrigieren'; readonly amount: number }

export function resolveConflict(conflict: ItemConflict, resolution: ConflictResolution): Item {
  const source: Source = resolution.kind === 'quelle-waehlen' ? resolution.source : { kind: 'eingabe' }
  const amount = resolution.amount
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('aufloesung.betrag must be a non-negative finite number')
  }
  return { id: conflict.itemId, incomeType: conflict.incomeType, amount, source }
}
