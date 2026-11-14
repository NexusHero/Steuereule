// The owl fills empty fields but does not change recorded ones on its own (ADR-0082): in the real case it
// proposed a premium ten times the one already read from a letter, though the user had not mentioned it.
import { describe, expect, it } from 'vitest'
import type { AdvisorActionProposal, AdvisorEnginePort } from '@steuereule/core'
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

function engineProposing(actions: AdvisorActionProposal[]): AdvisorEnginePort {
  return {
    async runTurn() {
      throw new Error('not used')
    },
    async *streamTurn() {
      for (const a of actions) yield { event: 'action', data: a }
      yield { event: 'done', data: { replyText: 'Erledigt.', meta: { actions }, mode: 'langgraph' } }
    },
  }
}

async function turn(message: string, actions: AdvisorActionProposal[]) {
  const kit = buildAdvisorTestKit(engineProposing(actions))
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
})
