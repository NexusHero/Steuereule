// ADR-018 — the Steuerjahr lifecycle state machine. Four edge cases were weighed; exactly
// TWO became real states, and two deliberately did not:
//   - "Rückfrage" (Finanzamt requests documents): a REAL state, between eingereicht and
//     bescheid, with its own UI and deadline.
//   - "Extern erledigt" (user files directly via ELSTER): a REAL state — the app becomes
//     an archive, not an empty nagging reminder.
//   - "Einreichung scheitert technisch": NOT a state — stays 'pruefung'; the failed
//     attempt is a toast + retry. A technical failure must never look like a tax status.
//   - "Frist verpasst": NOT a state — stays 'entwurf'; a warning banner on the draft.
// Pure, deterministic, no I/O (ADR-0004). The state ids are German tax-domain nouns; UI
// labels live in i18n.
//
// The exact transition TABLE below is this slice's interpretation of ADR-018's main flow
// ("Entwurf → Prüfung → Eingereicht → (Rückfrage ⇄) → Bescheid da → Abgeschlossen, plus
// Parallel-Ausgang 'Extern erledigt'") — recorded as an open product-confirmation item in
// the ticket and the ADR draft, not silently asserted as settled law.
export type SteuerjahrStatus =
  | 'entwurf'
  | 'pruefung'
  | 'eingereicht'
  | 'rueckfrage'
  | 'bescheid'
  | 'abgeschlossen'
  | 'extern-erledigt'

/** The legal successor states per current state. `abgeschlossen` and `extern-erledigt` are terminal. */
const UEBERGAENGE: Readonly<Record<SteuerjahrStatus, readonly SteuerjahrStatus[]>> = {
  entwurf: ['pruefung', 'extern-erledigt'],
  pruefung: ['eingereicht', 'entwurf', 'extern-erledigt'],
  eingereicht: ['rueckfrage', 'bescheid'],
  rueckfrage: ['eingereicht', 'bescheid'],
  bescheid: ['abgeschlossen'],
  abgeschlossen: [],
  'extern-erledigt': [],
}

/** Is `von → nach` a legal transition? The server validates every write against this. */
export function istUebergangErlaubt(von: SteuerjahrStatus, nach: SteuerjahrStatus): boolean {
  return UEBERGAENGE[von].includes(nach)
}

/** The states `von` may legally move to next (empty = terminal). */
export function naechsteZustaende(von: SteuerjahrStatus): readonly SteuerjahrStatus[] {
  return UEBERGAENGE[von]
}
