import { describe, expect, it } from 'vitest'
import type { Answers } from '../interview/interview'
import { filingObligation } from './filing-obligation'

// H5 (UX review 2026-11): the deadline banner may only alarm when the return is mandatory
// (Pflichtveranlagung, § 46 EStG / § 149 AO). A voluntary return (Antragsveranlagung) has four years.

const employee: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

describe('filingObligation', () => {
  it('is unklar before any answer — nothing alarming without facts', () => {
    expect(filingObligation({})).toBe('unklar')
  })

  it('is freiwillig for a plain single employee', () => {
    expect(filingObligation(employee)).toBe('freiwillig')
    expect(
      filingObligation({
        ...employee,
        einkuenfte: 'Nein',
        lohnersatz: 'Nein',
        nebenjob: 'Minijob',
        abfindung: 'Nein',
        'vorauszahlungen-gate': 'Nein',
      }),
    ).toBe('freiwillig')
  })

  it.each<[string, Answers]>([
    ['job Selbstständig', { job: 'Selbstständig' }],
    ['job Beides', { job: 'Beides' }],
    ['Grenzgänger Schweiz', { ausland: 'Ja, in die Schweiz' }],
    ['other foreign country', { ausland: 'In ein anderes Land' }],
    ['Lohnersatz', { lohnersatz: 'Ja' }],
    ['second employer (Steuerklasse VI)', { nebenjob: 'Nebenjob' }],
    ['Abfindung', { abfindung: 'Ja' }],
    ['prepayments set', { 'vorauszahlungen-gate': 'Ja' }],
  ])('is pflicht with %s', (_label, extra) => {
    expect(filingObligation({ ...employee, ...extra })).toBe('pflicht')
  })

  it.each<[string, Answers]>([
    ['Rente', { job: 'Rente' }],
    ['Verheiratet', { familienstand: 'Verheiratet' }],
    ['Kapitalerträge', { einkuenfte: 'Kapitalerträge' }],
    ['Vermietung', { einkuenfte: 'Vermietung' }],
    ['both other incomes', { einkuenfte: 'Beides' }],
  ])('is unklar with %s', (_label, extra) => {
    expect(filingObligation({ ...employee, ...extra })).toBe('unklar')
  })

  it('a mandatory reason wins over an unclear one', () => {
    expect(filingObligation({ ...employee, familienstand: 'Verheiratet', ausland: 'Ja, in die Schweiz' })).toBe('pflicht')
    expect(filingObligation({ job: 'Rente', 'vorauszahlungen-gate': 'Ja' })).toBe('pflicht')
  })
})
