// ADR-010 / ADR-030 — the Einkunftsart vocabulary, the shared tax-domain noun every
// vertical (Angestellte, Grenzgänger-CH) plugs into. A Steuerjahr owns a SET of
// Einkunftsarten (§ 2 EStG income categories), freely combinable — there is no
// "Profiltyp" per person, that was only an onboarding shorthand (ADR-010). Grenzgänger-CH
// plus Kapital plus Vermietung plus Kinder is one normal combination (ADR-030); Rente
// plus Vermietung plus Kapital is another (ADR-034). UI-free, no I/O (ADR-0004).
//
// The string VALUES are the German tax-domain vocabulary (byte-equal to ADR-010's own
// terms), not English identifiers — same reason the interview answer values are German:
// these are persisted domain facts, not dev-process symbols (ADR-0033 citation form).
// German labels for the UI live in the i18n layer, never here.
import type { Answers } from './interview.js'

export type Einkunftsart =
  | 'Nichtselbstständig' // Anlage N — employment income
  | 'Gewerbe' // Gewerbe/Selbstständig — EÜR; computation gated in 1.0 (ADR-028)
  | 'Vermietung' // Anlage V — rental income
  | 'Kapital' // Anlage KAP — capital income
  | 'Rente' // Anlage R — pension (ADR-034)
  | 'Grenzgänger' // the DE→CH commuter case (ADR-029), the one covered "Ausland" path

/** Canonical order — `einkunftsartenFromAnswers`/`gatedEinkunftsarten` return in this order. */
export const EINKUNFTSARTEN: readonly Einkunftsart[] = [
  'Nichtselbstständig',
  'Gewerbe',
  'Vermietung',
  'Kapital',
  'Rente',
  'Grenzgänger',
]

/** Total over `string`: is `value` a declared Einkunftsart? (mirrors isValidAnswer's totalism). */
export function isEinkunftsart(value: string): value is Einkunftsart {
  return (EINKUNFTSARTEN as readonly string[]).includes(value)
}

/**
 * ADR-010 — gates ADD Einkunftsarten rather than retyping the user. This pure mapping
 * derives the set from the stored interview answers. It records what the user DECLARED,
 * not what is computable: `Gewerbe` appears for `Selbstständig` and `Beides` even though
 * its computation is gated (ADR-028) — `gatedEinkunftsarten` is what marks it gated, this
 * function is what records the fact. Returned deduplicated, in `EINKUNFTSARTEN` order
 * (a set as a deterministic array — `ReadonlySet` has no value equality for tests).
 *
 * Not covered by any Einkunftsart: `ausland: 'In ein anderes Land'` (the CH-only gate —
 * no computable category exists for non-CH foreign work) and `einkuenfte: 'Nein'`.
 */
export function einkunftsartenFromAnswers(answers: Answers): readonly Einkunftsart[] {
  const declared = new Set<Einkunftsart>()

  switch (answers.job) {
    case 'Angestellt':
      declared.add('Nichtselbstständig')
      break
    case 'Selbstständig':
      declared.add('Gewerbe')
      break
    case 'Beides':
      declared.add('Nichtselbstständig')
      declared.add('Gewerbe')
      break
    case 'Rente':
      declared.add('Rente')
      break
  }

  // Only the covered cross-border case maps to an Einkunftsart (ADR-029); "In ein anderes
  // Land" is the CH-only gate and adds nothing.
  if (answers.ausland === 'Ja, in die Schweiz') declared.add('Grenzgänger')

  switch (answers.einkuenfte) {
    case 'Kapitalerträge':
      declared.add('Kapital')
      break
    case 'Vermietung':
      declared.add('Vermietung')
      break
    case 'Beides':
      declared.add('Kapital')
      declared.add('Vermietung')
      break
  }

  return EINKUNFTSARTEN.filter((art) => declared.has(art))
}

/**
 * ADR-028/032/033 — which DECLARED Einkunftsarten 1.0 cannot compute, honestly named
 * rather than guessed (ADR-032 honesty). Gating is a property of the ANSWER, not of the
 * Einkunftsart itself:
 *  - `Gewerbe` is always gated when declared — EÜR/Anlage G/S stay out (ADR-028). The
 *    terminal vs. passable distinction (Selbstständig vs. Beides) lives in the interview
 *    graph; here both leave `Gewerbe` gated.
 *  - `Kapital` is gated only for the Krypto broker answer (ADR-032); DE/foreign brokers
 *    are computable.
 *  - `Vermietung` is gated only for "Verkauf oder möbliert" (ADR-033); Einfach/Mehrere
 *    are computable.
 */
export function gatedEinkunftsarten(answers: Answers): readonly Einkunftsart[] {
  const declared = new Set(einkunftsartenFromAnswers(answers))
  const gated = new Set<Einkunftsart>()

  // Gate only what is DECLARED — a stray answer value (e.g. `kap-depot: 'Krypto'` without
  // `einkuenfte: 'Kapitalerträge'`) must not manufacture a gated Einkunftsart the user
  // never declared. `declared.has(...)` is the guard, same as Gewerbe above.
  if (declared.has('Gewerbe')) gated.add('Gewerbe')
  if (declared.has('Kapital') && answers['kap-depot'] === 'Krypto') gated.add('Kapital')
  if (declared.has('Vermietung') && answers['vermietung-art'] === 'Verkauf oder möbliert') gated.add('Vermietung')

  return EINKUNFTSARTEN.filter((art) => gated.has(art))
}
