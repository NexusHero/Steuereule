import { describe, expect, it } from 'vitest'
import { reasoningBlocks } from './reasoningBlocks'

describe('reasoningBlocks', () => {
  it('turns a bold-only line into a heading and drops the runs of blank lines', () => {
    const text = '**Calculating Commute**\n\nI am comparing the two.\n\n\n\n\n**Analyzing 2026**\n\nThe figures differ.'
    expect(reasoningBlocks(text)).toEqual([
      { kind: 'heading', text: 'Calculating Commute' },
      { kind: 'paragraph', text: 'I am comparing the two.' },
      { kind: 'heading', text: 'Analyzing 2026' },
      { kind: 'paragraph', text: 'The figures differ.' },
    ])
  })

  it('joins wrapped lines of one paragraph and strips leftover emphasis', () => {
    expect(reasoningBlocks('Die **Pauschale** gilt\nab dem ersten km.')).toEqual([{ kind: 'paragraph', text: 'Die Pauschale gilt ab dem ersten km.' }])
  })

  it('gives nothing for blank text', () => {
    expect(reasoningBlocks('  \n\n ')).toEqual([])
  })
})
