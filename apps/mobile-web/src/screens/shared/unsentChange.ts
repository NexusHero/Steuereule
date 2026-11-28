import { useRef } from 'react'

/**
 * Whether a value still has to be sent. Comparing it with what the server last told us is not enough:
 * while a save is on its way that picture is old, so a change back to it (add a row, remove it again)
 * looks like no change and would never be sent, and the server keeps what the user took away. A value is
 * therefore sent unless it equals the server's picture and nothing else was sent since. A send too many
 * costs a request; a send too few loses the user's change.
 */
export function useUnsentChange(): (stored: string, wanted: string) => boolean {
  const lastSent = useRef<string | null>(null)
  return (stored, wanted) => {
    if (wanted === stored && (lastSent.current === null || lastSent.current === wanted)) return false
    lastSent.current = wanted
    return true
  }
}
