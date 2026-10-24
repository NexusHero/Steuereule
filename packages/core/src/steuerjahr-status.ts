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

// --------------------------------------------------------------------------------------------
// The BESCHEID phase (ADR-009 "Bescheid eingegangen" branching point) — a sub-state machine
// INSIDE the main `bescheid` state above. The main machine (ADR-018) treats `bescheid` as one
// state; what happens WITHIN it is this phase's own progression, which the ticket 10.3 slice
// (Bescheidprüfung) needs server-validated like the outer machine:
//
//   eingegangen → geprüft → einspruch-eingelegt
//
//   - `eingegangen`: the Bescheid is in the inbox / its amounts are being entered.
//   - `geprüft`:     the user has seen the Abgleich (Bescheid vs. berechnet).
//   - `einspruch-eingelegt`: an Einspruch has been filed (Produkt-ADR-009, § 355 AO).
//
// "Kein stiller Übergang" (ticket AC): every move is an explicit, server-validated write
// against this closed map — the UI only offers `naechsteBescheidZustaende(von)` and the API
// rejects any other edge with `istBescheidUebergangErlaubt`. `einspruch-eingelegt` is terminal
// WITHIN this phase (the Finanzamt's response to the Einspruch is a later slice, not modelled).
export type BescheidStatus = 'eingegangen' | 'geprüft' | 'einspruch-eingelegt'

// No self-loops: each entry is a FORWARD progression only — `eingegangen → eingegangen`,
// `geprüft → geprüft` and `einspruch-eingelegt → einspruch-eingelegt` are all forbidden (the
// absence from this map IS the decision, pinned by steuerjahr-status.test.ts). A move is always
// an explicit, server-validated step; re-entering the same sub-state is never a legal write.
const BESCHEID_UEBERGAENGE: Readonly<Record<BescheidStatus, readonly BescheidStatus[]>> = {
  eingegangen: ['geprüft'],
  geprüft: ['einspruch-eingelegt'],
  'einspruch-eingelegt': [],
}

/** Is `von → nach` a legal bescheid-phase transition? The server validates every write against this. */
export function istBescheidUebergangErlaubt(von: BescheidStatus, nach: BescheidStatus): boolean {
  return BESCHEID_UEBERGAENGE[von].includes(nach)
}

/** The bescheid sub-states `von` may legally move to next (empty = terminal within the phase). */
export function naechsteBescheidZustaende(von: BescheidStatus): readonly BescheidStatus[] {
  return BESCHEID_UEBERGAENGE[von]
}
