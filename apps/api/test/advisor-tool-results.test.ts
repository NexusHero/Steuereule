import { describe, expect, it } from 'vitest'
import { toolResultLine } from '../src/ki/advisor-tool-results.js'

describe('toolResultLine', () => {
  it('names the tax effect a simulation computed, with its sign', () => {
    expect(toolResultLine('simulate_tax_delta', { ok: true, effect: 'computed', deltaEur: 234 })).toBe('+234 € Erstattung')
    expect(toolResultLine('simulate_tax_delta', { ok: true, effect: 'computed', deltaEur: -1500 })).toBe('−1.500 € Erstattung')
  })

  it('says so when the effect cannot be computed', () => {
    expect(toolResultLine('simulate_tax_delta', { ok: true, effect: 'not-computable', deltaEur: 0 })).toBe('nicht berechenbar')
  })

  it('reports a prepared draft with its effect', () => {
    expect(toolResultLine('stage_field_draft', { ok: true, stagedAction: { effect: 'computed', deltaEur: 780 } })).toBe('fertig · +780 € Erstattung')
    expect(toolResultLine('stage_field_draft', { ok: true, stagedAction: { effect: 'not-computable', deltaEur: 0 } })).toBe('fertig')
  })

  it('gives the income tax the tariff yields', () => {
    expect(toolResultLine('compute_income_tax', { ok: true, incomeTaxEur: 12345, totalEur: 13000 })).toBe('12.345 €')
  })

  it('names the paragraph and the knowledge entry it looked up', () => {
    expect(toolResultLine('lookup_legal_source', { ok: true, source: { paragraph: '§ 4 Abs. 5 Nr. 6c EStG', title: 'Homeoffice' } })).toBe('§ 4 Abs. 5 Nr. 6c EStG')
    expect(toolResultLine('lookup_tax_knowledge', { ok: true, title: 'Homeoffice-Tagespauschale' })).toBe('Homeoffice-Tagespauschale')
  })

  it('counts questions, choices and plan steps', () => {
    expect(toolResultLine('ask_questions', { ok: true, questions: 3 })).toBe('3 Fragen')
    expect(toolResultLine('ask_questions', { ok: true, questions: 1 })).toBe('1 Frage')
    expect(toolResultLine('ask_clarification', { ok: true, choices: ['a', 'b'] })).toBe('2 Antworten')
    expect(toolResultLine('plan_steps', { ok: true, shown: 4 })).toBe('4 Schritte')
  })

  it('never repeats the step label, so a line reads "label: result"', () => {
    for (const [tool, payload] of [['lookup_tax_knowledge', { ok: true, title: 'Kennzahlen je Steuerjahr' }], ['compute_income_tax', { ok: true, incomeTaxEur: 1 }], ['stage_field_draft', { ok: true, stagedAction: {} }]] as const) {
      expect(toolResultLine(tool, payload)).not.toMatch(/Gefunden|Einkommensteuer|Entwurf/)
    }
  })

  it('never repeats the text of a note or a suggestion', () => {
    expect(toolResultLine('remember_note', { ok: true, noted: 'Kita kostet 300 € im Monat' })).toBe('gemerkt')
    expect(toolResultLine('remember_note', { ok: true, alreadyNoted: true })).toBe('war schon notiert')
    expect(toolResultLine('replace_note', { ok: true, replaced: 'n1' })).toBe('aktualisiert')
    expect(toolResultLine('forget_note', { ok: true, removed: 'n1' })).toBe('entfernt')
    expect(toolResultLine('suggest_situation', { ok: true, suggested: 'Wir ziehen nach Köln' })).toBe('vorgeschlagen')
  })

  it('never passes on the reason a tool refused', () => {
    expect(toolResultLine('stage_field_draft', { ok: false, error: 'FIELD_LOCKED: Max Mustermann …' })).toBe('nicht möglich')
  })

  it('falls back to a plain done for a tool without a template', () => {
    expect(toolResultLine('propose_two_paths', { ok: true })).toBe('zwei Wege')
    expect(toolResultLine('some_new_tool', { ok: true })).toBe('erledigt')
  })
})
