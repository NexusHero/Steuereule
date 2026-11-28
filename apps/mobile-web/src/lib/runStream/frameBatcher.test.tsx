import { describe, expect, it } from 'vitest'
import { createFrameBatcher } from './frameBatcher'

function manualSchedule() {
  let scheduled: (() => void) | null = null
  let cancelled = 0
  return {
    schedule: (run: () => void) => {
      scheduled = run
      return () => {
        scheduled = null
        cancelled += 1
      }
    },
    frame: () => {
      const run = scheduled
      scheduled = null
      run?.()
    },
    get waiting() {
      return scheduled !== null
    },
    get cancelled() {
      return cancelled
    },
  }
}

describe('createFrameBatcher (#476)', () => {
  it('hands on everything pushed within a frame as one piece', () => {
    const clock = manualSchedule()
    const delivered: string[] = []
    const batcher = createFrameBatcher((text) => delivered.push(text), clock.schedule)
    for (const piece of ['Die ', 'Ent', 'fernungs', 'pauschale']) batcher.push(piece)
    expect(delivered).toEqual([])
    clock.frame()
    expect(delivered).toEqual(['Die Entfernungspauschale'])
  })

  it('schedules one frame per batch, and a new one for what comes after', () => {
    const clock = manualSchedule()
    const delivered: string[] = []
    const batcher = createFrameBatcher((text) => delivered.push(text), clock.schedule)
    batcher.push('a')
    clock.frame()
    expect(clock.waiting).toBe(false)
    batcher.push('b')
    expect(clock.waiting).toBe(true)
    clock.frame()
    expect(delivered).toEqual(['a', 'b'])
  })

  it('delivers at once on flush and does not deliver the same text again on the next frame', () => {
    const clock = manualSchedule()
    const delivered: string[] = []
    const batcher = createFrameBatcher((text) => delivered.push(text), clock.schedule)
    batcher.push('Rest')
    batcher.flush()
    clock.frame()
    expect(delivered).toEqual(['Rest'])
  })

  it('drops what is waiting on cancel', () => {
    const clock = manualSchedule()
    const delivered: string[] = []
    const batcher = createFrameBatcher((text) => delivered.push(text), clock.schedule)
    batcher.push('weg')
    batcher.cancel()
    clock.frame()
    batcher.flush()
    expect(delivered).toEqual([])
  })
})
