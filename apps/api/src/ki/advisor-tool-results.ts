// What a tool found, in a few words for the owl's line of thought. The app shows it after the
// tool's label ("Schlage im Steuerwissen nach: Kennzahlen je Steuerjahr"), so it never repeats the label.
// Built only from counts, amounts
// and fixed catalogue titles: never from text the model or the user wrote, so no personal data can
// slip into the step list.

const euro = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

const amount = (value: number): string => `${euro.format(Math.abs(Math.round(value)))} €`
const signed = (value: number): string => `${value < 0 ? '−' : '+'}${amount(value)}`
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

type Payload = Readonly<Record<string, unknown>>

const TEMPLATES: Readonly<Record<string, (payload: Payload) => string>> = {
  simulate_tax_delta: (p) => {
    const delta = num(p.deltaEur)
    return p.effect === 'computed' && delta !== null ? `${signed(delta)} Erstattung` : 'nicht berechenbar'
  },
  stage_field_draft: (p) => {
    const staged = (p.stagedAction ?? {}) as Payload
    const delta = num(staged.deltaEur)
    return staged.effect === 'computed' && delta !== null && delta !== 0 ? `fertig · ${signed(delta)} Erstattung` : 'fertig'
  },
  propose_two_paths: () => 'zwei Wege',
  ask_questions: (p) => plural(num(p.questions) ?? 0, 'Frage', 'Fragen'),
  ask_clarification: (p) => plural(Array.isArray(p.choices) ? p.choices.length : 0, 'Antwort', 'Antworten'),
  suggest_situation: () => 'vorgeschlagen',
  lookup_tax_knowledge: (p) => (typeof p.title === 'string' ? p.title : 'erledigt'),
  compute_income_tax: (p) => {
    const tax = num(p.incomeTaxEur)
    return tax !== null ? amount(tax) : 'erledigt'
  },
  lookup_legal_source: (p) => {
    const source = (p.source ?? {}) as Payload
    return typeof source.paragraph === 'string' ? source.paragraph : 'erledigt'
  },
  plan_steps: (p) => plural(num(p.shown) ?? 0, 'Schritt', 'Schritte'),
  remember_note: (p) => (p.alreadyNoted === true ? 'war schon notiert' : 'gemerkt'),
  replace_note: () => 'aktualisiert',
  forget_note: () => 'entfernt',
}

/** The result line of one tool call; a refusal stays "nicht möglich", its reason goes to the model only. */
export function toolResultLine(tool: string, payload: Payload): string {
  if (payload.ok !== true) return 'nicht möglich'
  return TEMPLATES[tool]?.(payload) ?? 'erledigt'
}
