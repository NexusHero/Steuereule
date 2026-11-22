import { createRequire } from 'node:module'

// React's scheduler is not a dependency of this app; it is react-dom's. Resolving it from react-dom's
// own location yields the very module instance react-dom required (Node's CJS cache is keyed by the
// resolved path), so a callback scheduled here queues behind the work react-dom has scheduled.
const requireFromReactDom = createRequire(createRequire(import.meta.url).resolve('react-dom'))

type Scheduler = {
  unstable_scheduleCallback: (priority: number, callback: () => void) => unknown
  unstable_IdlePriority: number
}
const scheduler = requireFromReactDom('scheduler') as Scheduler

/**
 * Resolves once React's scheduler has run everything queued ahead of an idle-priority task — above
 * all the passive effects (`useEffect`) of a commit that happened outside `act`, and any render those
 * effects schedule in turn. Idle priority never expires, so every non-idle task, including ones queued
 * while this waits, runs first.
 */
export function reactSchedulerIdle(): Promise<void> {
  return new Promise((resolve) => {
    scheduler.unstable_scheduleCallback(scheduler.unstable_IdlePriority, () => resolve())
  })
}
