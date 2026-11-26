import { describe, expect, it } from 'vitest'
import { reactSchedulerIdle } from './test-react-scheduler'
import type { SchedulerDelayProbe } from './test-scheduler-delay'

// Symbol.for, not an import of the constant: importing `./test-scheduler-delay` would install the delay
// in the plain run too.
const probe = (globalThis as Record<symbol, unknown>)[Symbol.for('steuereule.test.schedulerDelay')] as SchedulerDelayProbe | undefined

// The delayed run is only a guard while React's scheduler actually goes through the delayed
// `setImmediate`. Should the scheduler switch to another host primitive, or load before the delay,
// every test would pass there without having been slowed down — this one would not.
describe.runIf(probe !== undefined)('the scheduler-delay run', () => {
  it("slows React's scheduler down", async () => {
    const before = probe!.calls
    const started = performance.now()
    await reactSchedulerIdle()
    expect(probe!.calls).toBeGreaterThan(before)
    expect(performance.now() - started).toBeGreaterThanOrEqual(probe!.delayMs - 1)
  })
})
