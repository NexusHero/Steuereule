// The owl fills empty fields but does not change recorded ones on its own (ADR-0082): in the real case it
// proposed a premium ten times the one already read from a letter, though the user had not mentioned it.
import { describe, expect, it } from 'vitest'
import { preparedDraftsSentence, type AdvisorActionProposal, type AdvisorEnginePort } from '@steuereule/core'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'

const USER = 'user-ow'
const YEAR = 2025

const proposal = (field: string, newValue: string): AdvisorActionProposal => ({
  actionId: `act-${field}`,
  status: 'pending',
  screen: 'interview',
  field,
  instance: null,
  label: field === 'spenden-betrag' ? 'Spenden' : field,
  previousValue: null,
  newValue,
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'test',
  sourceId: 'estg-10b',
})

function engineProposing(actions: AdvisorActionProposal[], replyText = 'Erledigt.'): AdvisorEnginePort {
  return {
    async runTurn() {
      throw new Error('not used')
    },
    async *streamTurn() {
      for (const a of actions) yield { event: 'action', data: a }
      yield { event: 'done', data: { replyText, meta: { actions }, mode: 'langgraph' } }
    },
  }
}

async function turn(message: string, actions: AdvisorActionProposal[], replyText?: string) {
  const kit = buildAdvisorTestKit(engineProposing(actions, replyText))
  kit.interviewRepo.seed(USER, YEAR, { spenden: 'Ja', 'spenden-betrag': '300' })
  const res = await kit.service.sendMessage(USER, YEAR, { message })
  return res.assistantMessage
}

describe('the owl and recorded values (ADR-0082)', () => {
  it('leaves a recorded value as it is when the user did not ask, and says so', async () => {
    const reply = await turn('Danke, sonst nichts.', [proposal('spenden-betrag', '3000'), proposal('umzug-kosten', '800')])
    expect((reply.meta?.actions ?? []).map((a) => a.field)).toEqual(['umzug-kosten'])
    expect(reply.content).toContain('Spenden: steht schon auf 300')
  })

  it('prepares the change when the user names the new value', async () => {
    const reply = await turn('Die Spenden waren 3.000 € insgesamt.', [proposal('spenden-betrag', '3000')])
    expect(reply.meta?.actions?.[0]).toMatchObject({ field: 'spenden-betrag', newValue: '3000' })
  })

  it('says so when a draft is left out because the field already holds its value (real-data run: a card announced three times, never shown)', async () => {
    const reply = await turn('Bitte trag die Spenden und den Umzug ein.', [proposal('spenden-betrag', '300'), proposal('umzug-kosten', '800')])
    expect((reply.meta?.actions ?? []).map((a) => a.field)).toEqual(['umzug-kosten'])
    expect(reply.content).toContain('Schon genau so eingetragen')
    expect(reply.content).toContain('Spenden (300)')
  })
})

describe('the number of drafts an answer names (ADR-0066 Zero-Write)', () => {
  const stock = (...labels: string[]) => preparedDraftsSentence(labels)

  it('counts in the stock sentence only the drafts that are shown', async () => {
    const reply = await turn('Danke, sonst nichts.', [proposal('spenden-betrag', '3000'), proposal('umzug-kosten', '800')], stock('Spenden', 'umzug-kosten'))
    expect(reply.content).not.toContain('2 Entwürfe')
    expect(reply.content.startsWith('Ich habe den Entwurf „umzug-kosten“ als unverbindlichen Vorschlag vorbereitet.')).toBe(true)
  })

  it('keeps the stock sentence when every draft is shown', async () => {
    const reply = await turn('Umzug 800 €, Fortbildung 400 €.', [proposal('umzug-kosten', '800'), proposal('fortbildung-kosten', '400')], stock('umzug-kosten', 'fortbildung-kosten'))
    expect(reply.content.startsWith(stock('umzug-kosten', 'fortbildung-kosten'))).toBe(true)
    expect(reply.content).not.toContain('Hinweis der App')
  })

  it('names the real number when the model announces more drafts than there are', async () => {
    const reply = await turn('Umzug 800 €, Fortbildung 400 €.', [proposal('umzug-kosten', '800'), proposal('fortbildung-kosten', '400')], 'Mit deinen Angaben habe ich dir 4 neue Entwürfe vorbereitet: Umzug, Fortbildung, Kindergeld und Zusammenveranlagung.')
    expect(reply.content).toContain('Hinweis der App: Vorbereitet sind 2 Entwürfe, nicht 4.')
    expect((reply.meta?.actions ?? []).length).toBe(2)
  })

  it('names it too when nothing was prepared at all', async () => {
    const reply = await turn('Kindergeld bitte.', [proposal('spenden-betrag', '300')], 'Ich habe jetzt 3 Entwürfe vorbereitet – darunter auch die Karte für den Kindergeldanspruch.')
    expect(reply.content).toContain('Hinweis der App: Vorbereitet ist kein Entwurf, nicht 3.')
    expect(reply.content).toContain('Schon genau so eingetragen')
  })
})
