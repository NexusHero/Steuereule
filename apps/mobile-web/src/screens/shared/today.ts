import { todayIso as todayIsoIn } from '@steuereule/core'

/** Today as `YYYY-MM-DD` in the user's own time zone — the latest day a birth date calendar offers. */
export function todayIso(now: Date = new Date()): string {
  return todayIsoIn(now, 'local')
}
