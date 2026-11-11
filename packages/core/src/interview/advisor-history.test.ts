import { describe, expect, it } from 'vitest'
import { buildAdvisorHistory, estimateAdvisorTokens, type AdvisorHistorySource } from './advisor-history'
import type { AdvisorActionProposal } from './advisor'

function proposal(overrides: Partial<AdvisorActionProposal>): AdvisorActionProposal {
  return {
    actionId: 'act-1',
    status: 'pending',
    screen: 'commute',
    field: 'oneWayKm',
    instance: null,
    label: 'Einfacher Arbeitsweg',
    previousValue: null,
    newValue: '38',
    beforeRefundEur: 0,
    afterRefundEur: 120,
    deltaEur: 120,
    reason: 'r',
    sourceId: 'estg-9-1',
    ...overrides,
  }
}

const user = (content: string): AdvisorHistorySource => ({ role: 'user', content, meta: null })
const owl = (content: string, extra: Partial<AdvisorHistorySource> = {}): AdvisorHistorySource => ({
  role: 'assistant',
  content,
  meta: null,
  ...extra,
})

describe('buildAdvisorHistory (#476: memory by token budget)', () => {
  it('keeps a short conversation whole and in order', () => {
    const history = buildAdvisorHistory([user('Frage 1'), owl('Antwort 1'), user('Frage 2'), owl('Antwort 2')])
    expect(history.map((h) => h.content)).toEqual(['Frage 1', 'Antwort 1', 'Frage 2', 'Antwort 2'])
  })

  it('tells the model what it proposed and what became of it', () => {
    const history = buildAdvisorHistory([
      user('Mein Arbeitsweg sind 38 km'),
      owl('Ich habe einen Entwurf vorbereitet.', { meta: { action: proposal({ status: 'applied' }) } }),
    ])
    expect(history[1]!.content).toContain('Ich habe einen Entwurf vorbereitet.')
    expect(history[1]!.content).toContain('Einfacher Arbeitsweg')
    expect(history[1]!.content).toContain('38')
    expect(history[1]!.content).toContain('übernommen')
  })

  it('covers batch proposals and both paths of a two-paths comparison', () => {
    const history = buildAdvisorHistory([
      user('Homeoffice oder Arbeitszimmer?'),
      owl('Zwei Wege.', {
        meta: {
          actions: [proposal({ actionId: 'a', label: 'Spenden', status: 'dismissed' })],
          twoPaths: {
            title: 'Homeoffice',
            sourceId: 'estg-9-1',
            safePath: proposal({ actionId: 'b', label: 'Tagespauschale' }),
            maxPath: { ...proposal({ actionId: 'c', label: 'Arbeitszimmer' }), evidenceHint: 'h' },
          },
        },
      }),
    ])
    const text = history[1]!.content
    expect(text).toContain('Spenden')
    expect(text).toContain('verworfen')
    expect(text).toContain('Tagespauschale')
    expect(text).toContain('Arbeitszimmer')
    expect(text).toContain('offen')
  })

  it('marks an aborted answer and leaves failed or still-running ones out', () => {
    const history = buildAdvisorHistory([
      user('A'),
      owl('halbe Antw', { status: 'aborted' }),
      user('B'),
      owl('kaputt', { status: 'failed' }),
      user('C'),
      owl('', { status: 'streaming' }),
    ])
    expect(history.map((h) => h.content)).toEqual(['A', 'halbe Antw [abgebrochen]', 'B', 'C'])
  })

  it('skips turns that were regenerated away', () => {
    const history = buildAdvisorHistory([
      { role: 'user', content: 'alt', meta: { replaced: true } },
      owl('alt', { meta: { replaced: true } }),
      user('neu'),
    ])
    expect(history.map((h) => h.content)).toEqual(['neu'])
  })

  it('stays inside the token budget and folds older turns into one leading note', () => {
    const long = 'x'.repeat(400)
    const messages: AdvisorHistorySource[] = []
    for (let i = 1; i <= 20; i += 1) {
      messages.push(user(`Frage ${i} ${long}`), owl(`Antwort ${i} ${long}`))
    }
    const history = buildAdvisorHistory(messages, { maxTokens: 1000 })
    const total = history.reduce((sum, h) => sum + estimateAdvisorTokens(h.content), 0)
    expect(total).toBeLessThanOrEqual(1000)
    expect(history[0]!.role).toBe('user')
    expect(history[0]!.content).toContain('Früherer Gesprächsverlauf')
    // The note keeps the most recent of the older questions and drops the oldest first.
    expect(history[0]!.content).toContain('Frage 17 ')
    expect(history[0]!.content).not.toContain('Frage 1 x')
    expect(history.at(-1)!.content).toContain('Antwort 20')
    // The recent window starts with a question, never with an orphaned answer.
    expect(history[1]!.role).toBe('user')
  })

  it('remembers the outcome of old proposals in the note', () => {
    const long = 'x'.repeat(2000)
    const history = buildAdvisorHistory(
      [
        user('Spende eintragen'),
        owl('Entwurf.', { meta: { action: proposal({ label: 'Spenden 2025', newValue: '300', status: 'applied' }) } }),
        user(`neu ${long}`),
        owl(`ok ${long}`),
      ],
      { maxTokens: 1300 },
    )
    expect(history[0]!.content).toContain('Spenden 2025')
    expect(history[0]!.content).toContain('übernommen')
  })

  it('always keeps the latest message, even when it alone exceeds the budget', () => {
    const history = buildAdvisorHistory([user('y'.repeat(9000))], { maxTokens: 100 })
    expect(history).toHaveLength(1)
  })
})
