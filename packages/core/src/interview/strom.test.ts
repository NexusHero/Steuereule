import { describe, expect, it } from 'vitest'
import { ENTRIES, GATE_ACKNOWLEDGED, isReachableFor } from './interview'
import { AMOUNT_LATER, type Answers } from '../domains/answers'
import {
  STROM_TOPICS,
  answersToPost,
  deselectedWithAnswers,
  initialSelection,
  isTopicApplicable,
  isTopicOpen,
  pageSteps,
  selectionChanges,
  topicEntry,
  topicKinds,
  topicPageSteps,
} from './strom'

const EMPLOYED: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

describe('the Strom topics (ADR-0089)', () => {
  it('every topic is a top-level question of a catalogue entry, listed once', () => {
    const ids = STROM_TOPICS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      const entry = topicEntry(id)
      expect(ENTRIES[entry.id].steps).toContain(id)
    }
  })

  it('a topic of an order-free entry is reachable without its siblings — the selection answers them in any order', () => {
    expect(isReachableFor(ENTRIES.lebenslagen, {}, 'umzug')).toBe(true)
    expect(isReachableFor(ENTRIES.lebenslagen, { dhf: 'Ja' }, 'umzug')).toBe(true)
    expect(isReachableFor(ENTRIES.sonderausgaben, {}, 'riester')).toBe(true)
    // A follow-up still needs its own question answered the right way.
    expect(isReachableFor(ENTRIES.lebenslagen, {}, 'umzug-kosten')).toBe(false)
    expect(isReachableFor(ENTRIES.lebenslagen, { umzug: 'Nein' }, 'umzug-kosten')).toBe(false)
    expect(isReachableFor(ENTRIES.lebenslagen, { umzug: 'Ja' }, 'umzug-kosten')).toBe(true)
  })

  it('the basis page asks a commuter about a German job, and a pensioner not (Echtdatentest 18.11.2026)', () => {
    const gate = ENTRIES['minimal-gate']
    expect(pageSteps(gate, { job: 'Angestellt', ausland: 'Ja, in die Schweiz' })).toContain('de-job')
    expect(pageSteps(gate, { job: 'Rente', ausland: 'Ja, in die Schweiz' })).not.toContain('de-job')
    const pensioner = answersToPost(gate, { job: 'Rente', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' }, {})
    expect(pensioner.complete).toBe(true)
    expect(pensioner.posts.map((p) => p.questionId)).toEqual(['job', 'ausland', 'kinder', 'familienstand'])
    expect(answersToPost(gate, { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' }, {}).complete).toBe(false)
  })

  it('the Minimal-Gate keeps its order: the basis page answers it top to bottom', () => {
    expect(isReachableFor(ENTRIES['minimal-gate'], {}, 'kinder')).toBe(false)
  })
})

describe('the selection page', () => {
  it('starts from the stored answers: Ja (or a kind) is chosen, Nein and unanswered are not', () => {
    expect(initialSelection({ spenden: 'Ja', riester: 'Nein', nebenjob: 'Minijob', einkuenfte: 'Nein' })).toEqual({ spenden: 'Ja', nebenjob: 'Minijob' })
  })

  it('answers Ja for a chosen yes/no topic and Nein for every topic left out, in catalogue order', () => {
    const changes = selectionChanges({}, { umzug: 'Ja', spenden: 'Ja' }, EMPLOYED)
    expect(changes).toContainEqual({ questionId: 'umzug', value: 'Ja' })
    expect(changes).toContainEqual({ questionId: 'spenden', value: 'Ja' })
    expect(changes).toContainEqual({ questionId: 'dhf', value: 'Nein' })
    expect(changes).toContainEqual({ questionId: 'riester', value: 'Nein' })
    expect(changes.findIndex((c) => c.questionId === 'dhf')).toBeLessThan(changes.findIndex((c) => c.questionId === 'umzug'))
  })

  it('takes the kind of a topic that has one (Nebenjob, Einkünfte) right on the selection page, never Nein', () => {
    expect(topicKinds('nebenjob')).toEqual(['Minijob', 'Midijob', 'Nebenjob'])
    expect(topicKinds('spenden')).toBeNull()
    expect(selectionChanges({}, { nebenjob: 'Midijob' }, EMPLOYED)).toContainEqual({ questionId: 'nebenjob', value: 'Midijob' })
    expect(selectionChanges({ nebenjob: 'Minijob' }, {}, EMPLOYED)).toContainEqual({ questionId: 'nebenjob', value: 'Nein' })
  })

  it('sends nothing that is already stored', () => {
    expect(selectionChanges({ spenden: 'Ja', umzug: 'Nein' }, { spenden: 'Ja' }, EMPLOYED).some((c) => c.questionId === 'spenden' || c.questionId === 'umzug')).toBe(false)
  })

  it('names a topic left out that already holds an answer behind it, so the page can ask first', () => {
    const stored: Answers = { spenden: 'Ja', 'spenden-betrag': '300', riester: 'Ja' }
    expect(deselectedWithAnswers(stored, { riester: 'Ja' })).toEqual(['spenden'])
    expect(deselectedWithAnswers(stored, { spenden: 'Ja', riester: 'Ja' })).toEqual([])
  })

  it('offers the training costs only to someone who works', () => {
    expect(isTopicApplicable('fortbildung', EMPLOYED)).toBe(true)
    expect(isTopicApplicable('fortbildung', { ...EMPLOYED, job: 'Rente' })).toBe(false)
    expect(selectionChanges({}, {}, { ...EMPLOYED, job: 'Rente' }).some((c) => c.questionId === 'fortbildung')).toBe(false)
  })
})

describe('a topic page', () => {
  it('shows every amount of the topic on one page — Kranken- und Pflegeversicherung together', () => {
    expect(topicPageSteps('kv-pv', { 'kv-pv': 'Ja' })).toEqual(['kv-pv-art', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag'])
    expect(topicPageSteps('kv-pv', { 'kv-pv': 'Ja', 'kv-pv-art': 'Privat' })).toEqual(['kv-pv-art', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag'])
    expect(topicPageSteps('kv-pv', { 'kv-pv': 'Ja', 'kv-pv-art': 'Gesetzlich (freiwillig)' })).toEqual([
      'kv-pv-art',
      'kv-krankengeld',
      'kv-pv-betrag',
      'pv-betrag',
      'kv-wahl-betrag',
    ])
  })

  it('asks the medical costs and what was reimbursed on one page (real case 2024)', () => {
    expect(topicPageSteps('gesundheit-gate', { 'gesundheit-gate': 'Ja' })).toEqual(['gesundheit-betrag', 'gesundheit-erstattung'])
  })

  it('has no page when the topic asks nothing further (a Minijob)', () => {
    expect(topicPageSteps('nebenjob', { nebenjob: 'Midijob' })).toEqual(['nebenjob-brutto'])
    expect(topicPageSteps('nebenjob', { nebenjob: 'Minijob' })).toEqual([])
    expect(isTopicOpen('nebenjob', { nebenjob: 'Minijob' })).toBe(false)
  })

  it('a page of a whole entry shows its questions and notices in order (Alleinerziehend)', () => {
    expect(pageSteps(ENTRIES.alleinerziehend, {})).toEqual(['ae-weitere-person', 'ae-haushaltsgemeinschaft'])
  })

  it('posts the page top-down, acknowledges a notice on the way and sends only what changed', () => {
    const stored: Answers = { einkuenfte: 'Kapitalerträge' }
    const draft: Answers = { ...stored, 'kap-depot': 'Krypto' }
    expect(answersToPost(topicEntry('einkuenfte'), draft, stored)).toEqual({
      complete: true,
      posts: [
        { questionId: 'kap-depot', value: 'Krypto' },
        { questionId: 'krypto-gate', value: GATE_ACKNOWLEDGED },
      ],
    })
  })

  it('stops at the first empty field and says the page is not complete', () => {
    const stored: Answers = { riester: 'Ja' }
    const result = answersToPost(topicEntry('riester'), { ...stored, 'riester-art': 'Mittelbar' }, stored)
    expect(result.complete).toBe(false)
    expect(result.posts).toEqual([])
  })

  it('posts the Minimal-Gate of the basis page in its order and stops after a final notice', () => {
    expect(answersToPost(ENTRIES['minimal-gate'], { job: 'Beides', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }, {}).posts).toEqual([
      { questionId: 'job', value: 'Beides' },
      { questionId: 'gewerbe', value: GATE_ACKNOWLEDGED },
      { questionId: 'ausland', value: 'Nein' },
      { questionId: 'kinder', value: 'Nein' },
      { questionId: 'familienstand', value: 'Ledig' },
    ])
    expect(answersToPost(ENTRIES['minimal-gate'], { job: 'Selbstständig', ausland: 'Nein' }, {})).toEqual({
      complete: true,
      posts: [
        { questionId: 'job', value: 'Selbstständig' },
        { questionId: 'gewerbe', value: GATE_ACKNOWLEDGED },
      ],
    })
  })
})

describe('which topic is still open', () => {
  it('a chosen topic is open until its page is answered; an amount marked später keeps it open', () => {
    expect(isTopicOpen('spenden', { spenden: 'Ja' })).toBe(true)
    expect(isTopicOpen('spenden', { spenden: 'Ja', 'spenden-betrag': '300' })).toBe(false)
    expect(isTopicOpen('spenden', { spenden: 'Ja', 'spenden-betrag': AMOUNT_LATER })).toBe(true)
    expect(isTopicOpen('spenden', { spenden: 'Nein' })).toBe(false)
  })
})

describe('the Gewerbe gate with the self-employment switch (ADR-0101 §20)', () => {
  const gate = ENTRIES['minimal-gate']
  it('shows the gate on the basis page while the switch is off, and not when it is on', () => {
    expect(pageSteps(gate, { job: 'Selbstständig' })).toContain('gewerbe')
    expect(pageSteps(gate, { job: 'Selbstständig' }, { selfEmployment: true })).not.toContain('gewerbe')
  })
  it('stops at the gate while the switch is off, and walks on to the next questions when it is on', () => {
    const off = answersToPost(gate, { job: 'Selbstständig' }, {})
    expect(off.complete).toBe(true)
    expect(off.posts.map((p) => p.questionId)).toContain('gewerbe')
    const on = answersToPost(gate, { job: 'Selbstständig' }, {}, { selfEmployment: true })
    expect(on.complete).toBe(false)
  })
})

describe('the provision topics of the self-employed (ADR-0101 §22)', () => {
  it('show their amounts on the topic page, without the switch option the page passes', () => {
    expect(topicPageSteps('altersvorsorge', { job: 'Selbstständig', altersvorsorge: 'Ja' })).toEqual(['av-rv-betrag', 'av-versorgungswerk-betrag', 'av-basisrente-betrag', 'av-ksk'])
    expect(topicPageSteps('versicherungen', { job: 'Selbstständig', versicherungen: 'Ja' })).toEqual(['versicherungen-betrag'])
    expect(isTopicApplicable('altersvorsorge', { job: 'Angestellt' })).toBe(false)
  })
})
