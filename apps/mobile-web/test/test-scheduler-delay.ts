// Loaded first by `vitest.scheduler-delay.config.ts`, before react-dom (and with it React's scheduler)
// is imported: the scheduler keeps the `setImmediate` it finds at load time. Delaying it reproduces,
// every run, what a loaded CI runner does only sometimes — React's queued work (passive effects above
// all) lands well after the DOM commit and after RTL's own `setTimeout(0)` drain. A test that acts in
// that gap fails here deterministically instead of flaking in CI.

/** Long enough that any `setTimeout(0)`-paced step overtakes the scheduler; short enough for the suite. */
const SCHEDULER_DELAY_MS = 30

/** Read by `test-scheduler-delay.test.tsx`, the canary that the delay still reaches React's scheduler. */
export interface SchedulerDelayProbe {
  readonly delayMs: number
  calls: number
}
export const SCHEDULER_DELAY_PROBE = Symbol.for('steuereule.test.schedulerDelay')

const probe: SchedulerDelayProbe = { delayMs: SCHEDULER_DELAY_MS, calls: 0 }
const realSetTimeout = globalThis.setTimeout
;(globalThis as Record<symbol, unknown>)[SCHEDULER_DELAY_PROBE] = probe

globalThis.setImmediate = ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
  probe.calls += 1
  return realSetTimeout(() => callback(...args), SCHEDULER_DELAY_MS)
}) as unknown as typeof setImmediate
