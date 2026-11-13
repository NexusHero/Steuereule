import { describe, expect, it } from 'vitest'
import { foldThoughtEvent, thoughtStepsOf, type AdvisorThoughtStep } from './advisor-thought'

describe('foldThoughtEvent', () => {
  it('adds a status line as a status step', () => {
    expect(foldThoughtEvent([], { event: 'status', data: { text: 'Eule prüft deine Akte …' } })).toEqual([
      { kind: 'status', label: 'Eule prüft deine Akte …' },
    ])
  })

  it('adds a tool call as a running tool step', () => {
    expect(foldThoughtEvent([], { event: 'tool', data: { name: 'lookup_legal_source', label: 'Prüfe EStG-Paragraph …' } })).toEqual([
      { kind: 'tool', tool: 'lookup_legal_source', label: 'Prüfe EStG-Paragraph …' },
    ])
  })

  it('puts the result on the latest running call of that tool', () => {
    const steps: AdvisorThoughtStep[] = [
      { kind: 'tool', tool: 'compute_income_tax', label: 'Rechne …', result: '1.000 €', ok: true },
      { kind: 'tool', tool: 'lookup_legal_source', label: 'Prüfe …' },
      { kind: 'tool', tool: 'compute_income_tax', label: 'Rechne …' },
    ]
    const next = foldThoughtEvent(steps, { event: 'tool_result', data: { name: 'compute_income_tax', ok: true, result: '2.000 €' } })
    expect(next[2]).toEqual({ kind: 'tool', tool: 'compute_income_tax', label: 'Rechne …', result: '2.000 €', ok: true })
    expect(next[0]?.result).toBe('1.000 €')
    expect(next[1]?.result).toBeUndefined()
  })

  it('ignores a result no running call is waiting for', () => {
    const steps: AdvisorThoughtStep[] = [{ kind: 'status', label: 'x' }]
    expect(foldThoughtEvent(steps, { event: 'tool_result', data: { name: 'plan_steps', ok: true, result: 'y' } })).toBe(steps)
  })

  it('leaves the steps untouched on every other event', () => {
    const steps: AdvisorThoughtStep[] = []
    expect(foldThoughtEvent(steps, { event: 'token', data: { text: 'a' } })).toBe(steps)
  })
})

describe('thoughtStepsOf', () => {
  it('prefers the structured steps', () => {
    expect(thoughtStepsOf({ thoughtSteps: [{ kind: 'tool', tool: 'x', label: 'X' }], steps: ['old'] })).toEqual([{ kind: 'tool', tool: 'x', label: 'X' }])
  })

  it('reads the plain lines of older answers as status steps', () => {
    expect(thoughtStepsOf({ steps: ['Prüfe …', 'Rechne …'] })).toEqual([
      { kind: 'status', label: 'Prüfe …' },
      { kind: 'status', label: 'Rechne …' },
    ])
  })

  it('is empty without a meta', () => {
    expect(thoughtStepsOf(null)).toEqual([])
  })
})
