import { describe, expect, it } from 'vitest'
import {
  advisorContextUsage,
  buildAdvisorHistory,
  fallbackSummary,
  summaryCut,
  transcriptForSummary,
  type AdvisorHistorySource,
} from './advisor-history'

const turn = (n: number, size = 400): AdvisorHistorySource[] => [
  { role: 'user', content: `Frage ${n} ${'x'.repeat(size)}`, meta: null },
  { role: 'assistant', content: `Antwort ${n} ${'y'.repeat(size)}`, meta: null },
]
const turns = (count: number, size?: number): AdvisorHistorySource[] => Array.from({ length: count }, (_, i) => turn(i + 1, size)).flat()

describe('context of a conversation (#481)', () => {
  it('is empty for a new conversation and fills with what is said', () => {
    expect(advisorContextUsage([])).toMatchObject({ usedTokens: 0, percent: 0, level: 'ok' })
    const some = advisorContextUsage(turns(4), null, 1000)
    expect(some.percent).toBeGreaterThan(50)
    expect(some.usedTokens).toBeGreaterThan(0)
  })

  it('warns before it is full, and reads 100 % once it is', () => {
    expect(advisorContextUsage(turns(4), null, 1000).level).toBe('warn')
    expect(advisorContextUsage(turns(6), null, 1000)).toMatchObject({ percent: 100, level: 'full' })
  })

  it('counts the summary so far, and nothing of what failed or was replaced', () => {
    const base = advisorContextUsage(turns(1), null, 1000).usedTokens
    expect(advisorContextUsage(turns(1), 'Der Nutzer pendelt 38 km.', 1000).usedTokens).toBeGreaterThan(base)
    const withFailed: AdvisorHistorySource[] = [...turns(1), { role: 'assistant', content: 'z'.repeat(2000), meta: null, status: 'failed' }]
    expect(advisorContextUsage(withFailed, null, 1000).usedTokens).toBe(base)
  })
})

describe('summaryCut', () => {
  it('keeps the newest turns and never separates a question from its answer', () => {
    const messages = turns(6)
    const cut = summaryCut(messages, 1000)
    expect(cut).toBeGreaterThan(0)
    expect(cut % 2).toBe(0)
    expect(messages[cut]!.role).toBe('user')
    expect(messages.length - cut).toBeGreaterThanOrEqual(2)
  })

  it('has nothing to summarise in a short conversation', () => {
    expect(summaryCut(turns(1), 6000)).toBe(0)
    expect(summaryCut([], 6000)).toBe(0)
  })

  it('keeps the latest question with its answer even when that alone is over the share', () => {
    const messages = [...turns(3), ...turn(4, 4000)]
    expect(summaryCut(messages, 1000)).toBe(6)
  })
})

describe('history with a summary', () => {
  it('puts the summary first and the kept turns after it', () => {
    const history = buildAdvisorHistory(turns(1), { summary: 'Der Nutzer pendelt 38 km und hat 300 € gespendet.' })
    expect(history[0]!.content).toContain('Zusammenfassung des bisherigen Gesprächs')
    expect(history[0]!.content).toContain('38 km')
    expect(history.slice(1).map((e) => e.role)).toEqual(['user', 'assistant'])
  })

  it('is unchanged without one', () => {
    expect(buildAdvisorHistory(turns(1))).toHaveLength(2)
    expect(buildAdvisorHistory(turns(1), { summary: '  ' })).toHaveLength(2)
  })
})

describe('what goes to the summariser', () => {
  it('is the older part as plain dialogue, with what became of the proposals', () => {
    const older: AdvisorHistorySource[] = [
      { role: 'user', content: 'Ich habe 300 € gespendet.', meta: null },
      {
        role: 'assistant', content: 'Vorbereitet.',
        meta: { action: { actionId: 'a', status: 'applied', screen: 'interview', field: 'spenden-betrag', instance: null, label: 'Spenden', previousValue: null, newValue: '300', beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: '', sourceId: 'estg-10b' } },
      },
    ]
    const transcript = transcriptForSummary(older)
    expect(transcript).toContain('Nutzer: Ich habe 300 € gespendet.')
    expect(transcript).toContain('Eule: Vorbereitet.')
    expect(transcript).toContain('übernommen')
  })

  it('falls back to the questions and proposals when no model answers', () => {
    const summary = fallbackSummary(turns(2, 20), 'Früher: Arbeitsweg 38 km.')
    expect(summary).toContain('Früher: Arbeitsweg 38 km.')
    expect(summary).toContain('Frage: Frage 1')
  })
})
