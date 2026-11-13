// What a tool found, in a few words for the owl's line of thought. Built only from counts, amounts
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
    return p.effect === 'computed' && delta !== null ? `Wirkung: ${signed(delta)} Erstattung` : 'Wirkung nicht berechenbar'
  },
  stage_field_draft: (p) => {
    const staged = (p.stagedAction ?? {}) as Payload
    const delta = num(staged.deltaEur)
    return staged.effect === 'computed' && delta !== null && delta !== 0 ? `Entwurf vorbereitet · ${signed(delta)}` : 'Entwurf vorbereitet'
  },
  propose_two_paths: () => 'Zwei Wege verglichen',
  ask_questions: (p) => plural(num(p.questions) ?? 0, 'Frage', 'Fragen'),
  ask_clarification: (p) => `${Array.isArray(p.choices) ? p.choices.length : 0} Antworten zur Auswahl`,
  suggest_situation: () => 'Ergänzung vorgeschlagen',
  lookup_tax_knowledge: (p) => (typeof p.title === 'string' ? `Gefunden: ${p.title}` : 'Nachgeschlagen'),
  compute_income_tax: (p) => {
    const tax = num(p.incomeTaxEur)
    return tax !== null ? `Einkommensteuer: ${amount(tax)}` : 'Gerechnet'
  },
  lookup_legal_source: (p) => {
    const source = (p.source ?? {}) as Payload
    return typeof source.paragraph === 'string' ? source.paragraph : 'Nachgeschlagen'
  },
  plan_steps: (p) => `Plan mit ${plural(num(p.shown) ?? 0, 'Schritt', 'Schritten')}`,
  remember_note: (p) => (p.alreadyNoted === true ? 'War schon notiert' : 'Notiz gemerkt'),
  replace_note: () => 'Notiz aktualisiert',
  forget_note: () => 'Notiz entfernt',
}

/** The result line of one tool call; a refusal stays "Nicht möglich", its reason goes to the model only. */
export function toolResultLine(tool: string, payload: Payload): string {
  if (payload.ok !== true) return 'Nicht möglich'
  return TEMPLATES[tool]?.(payload) ?? 'Erledigt'
}
