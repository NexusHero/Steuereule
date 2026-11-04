import type { Quelle } from './berechnung'

export type WechselkursModus = 'amtlich' | 'tatsaechlich'

/** A CHF→EUR exchange rate with its provenance. */
export interface Wechselkurs {
  readonly monat: string
  readonly kurs: number
  readonly modus: WechselkursModus
  readonly belegId?: string
}

const MONAT = /^\d{4}-\d{2}$/

function validate(monat: string, kurs: number): void {
  if (!MONAT.test(monat)) throw new RangeError('monat must be yyyy-mm')
  if (!Number.isFinite(kurs) || kurs <= 0) throw new RangeError('kurs must be a positive finite number')
}

export function amtlicherMonatskurs(monat: string, kurs: number): Wechselkurs {
  validate(monat, kurs)
  return { monat, kurs, modus: 'amtlich' }
}

export function tatsaechlicherKurs(monat: string, kurs: number, belegId: string): Wechselkurs {
  validate(monat, kurs)
  if (belegId === '') throw new RangeError('a tatsächlicher Kurs requires a Beleg (ADR-012)')
  return { monat, kurs, modus: 'tatsaechlich', belegId }
}

export function erlaubteModi(hatBeleg: boolean): readonly WechselkursModus[] {
  return hatBeleg ? (['amtlich', 'tatsaechlich'] as const) : (['amtlich'] as const)
}

export function chfNachEur(betragChf: number, kurs: number): number {
  if (!Number.isFinite(betragChf) || betragChf < 0) {
    throw new RangeError('betragChf must be a non-negative finite number')
  }
  if (!Number.isFinite(kurs) || kurs <= 0) throw new RangeError('kurs must be a positive finite number')
  return Math.round(betragChf * kurs * 100) / 100
}

export function wechselkursQuelle(kurs: Wechselkurs): Quelle {
  if (kurs.modus === 'amtlich') return { art: 'regel', regel: 'BMF-Monatskurs' }
  return { art: 'beleg', belegId: kurs.belegId as string }
}
