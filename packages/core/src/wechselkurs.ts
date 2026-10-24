// ADR-012 — Wechselkurs: amtlich als Standard, tatsächlich als belegpflichtige Option.
// The Grenzgänger thinks in CHF, the Finanzamt gets EUR (ADR-036); the conversion carries
// its provenance (Kurs + Modus). The amtliche BMF-Monatskurs is the DEFAULT and needs no
// Beleg; the tatsächliche Kurs (from a Kontoauszug) is only representable WITH a Beleg —
// "ohne Beleg kein tatsächlicher Kurs" (ADR-012) is a FACTORY invariant here (enforced by
// `tatsaechlicherKurs`, plus a plausibility check for PERSISTED data), not a type-level one:
// `Wechselkurs.belegId` is a plain optional field, so the TYPE itself does not reject
// `{ modus: 'tatsaechlich' }` without a Beleg. Mischbetrieb is allowed per Monat but
// consistent within one Monat (ADR-012).
// Pure, no I/O (ADR-0004) — the BMF rate SOURCE is a later backend slice (ADR-012
// "API-Quelle für BMF-Kurse ist Backend-Aufgabe"); this module takes the rate as an input.
import type { Quelle } from './berechnung.js'

/** The two modes ADR-012 allows: amtlich (rule-default) vs tatsächlich (requires a Beleg). */
export type WechselkursModus = 'amtlich' | 'tatsaechlich'

/** A CHF→EUR exchange rate with its provenance. `kurs` is EUR per 1 CHF. */
export interface Wechselkurs {
  /** yyyy-mm the rate applies to (BMF monthly rates are per calendar month). */
  readonly monat: string
  /** EUR per 1 CHF, strictly positive. */
  readonly kurs: number
  readonly modus: WechselkursModus
  /** Present iff `modus === 'tatsaechlich'` — the Kontoauszug Beleg (ADR-012). Optional in
   *  the TYPE (a persisted/constructed object can omit it); enforced by `tatsaechlicherKurs`
   *  at construction and by `pruefeGrenzgaenger` for persisted data. */
  readonly belegId?: string
}

const MONAT = /^\d{4}-\d{2}$/

function validate(monat: string, kurs: number): void {
  if (!MONAT.test(monat)) throw new RangeError('monat must be yyyy-mm')
  if (!Number.isFinite(kurs) || kurs <= 0) throw new RangeError('kurs must be a positive finite number')
}

/** The amtliche BMF-Monatskurs — the default, no Beleg (ADR-012). */
export function amtlicherMonatskurs(monat: string, kurs: number): Wechselkurs {
  validate(monat, kurs)
  return { monat, kurs, modus: 'amtlich' }
}

/**
 * The tatsächliche Kurs — representable ONLY with a Beleg. `belegId` is mandatory, so
 * "tatsächlich ohne Beleg" cannot be constructed through this factory (ADR-012's rule is a
 * factory invariant, not a type-level one — the `Wechselkurs` type itself stays permissive;
 * see the header comment and `pruefeGrenzgaenger` for the persisted-data check).
 */
export function tatsaechlicherKurs(monat: string, kurs: number, belegId: string): Wechselkurs {
  validate(monat, kurs)
  if (belegId === '') throw new RangeError('a tatsächlicher Kurs requires a Beleg (ADR-012)')
  return { monat, kurs, modus: 'tatsaechlich', belegId }
}

/**
 * ADR-012's two-state UI. Without a Kontoauszug Beleg only the amtliche Kurs is offered;
 * with one, both are — the tatsächliche needs its Beleg to be chosen. Returns the modes in
 * offer order (amtlich first, the default).
 */
export function erlaubteModi(hatBeleg: boolean): readonly WechselkursModus[] {
  return hatBeleg ? (['amtlich', 'tatsaechlich'] as const) : (['amtlich'] as const)
}

/**
 * ADR-036 — CHF führt, EUR daneben. Converts a CHF amount to EUR at a rate, rounding to
 * whole cents (round half up — positive amounts only, so `Math.round` is deterministic and
 * documented here). The Posten-level rounding to whole euros is the caller's display concern.
 */
export function chfNachEur(betragChf: number, kurs: number): number {
  if (!Number.isFinite(betragChf) || betragChf < 0) {
    throw new RangeError('betragChf must be a non-negative finite number')
  }
  if (!Number.isFinite(kurs) || kurs <= 0) throw new RangeError('kurs must be a positive finite number')
  return Math.round(betragChf * kurs * 100) / 100
}

/**
 * The Herkunft the Wechselkurs contributes to a Posten (ADR-014/015 "jede Zahl trägt
 * Herkunft"): the amtliche Kurs is a `regel`, the tatsächliche is a `beleg`. The rate/month
 * themselves stay on the `Wechselkurs` (the chip renders "Regel: BMF-Monatskurs 0,9412"
 * from the modus + kurs, not from this rule id alone).
 */
export function wechselkursQuelle(kurs: Wechselkurs): Quelle {
  if (kurs.modus === 'amtlich') return { art: 'regel', regel: 'BMF-Monatskurs' }
  return { art: 'beleg', belegId: kurs.belegId as string }
}
