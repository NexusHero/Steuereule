import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUnsentChange } from './unsentChange'

const guard = () => renderHook(() => useUnsentChange()).result.current

describe('whether a value still has to be sent', () => {
  it('sends a value that differs from what the server holds, and not the one it holds', () => {
    const unsent = guard()
    expect(unsent('a', 'a')).toBe(false)
    expect(unsent('a', 'b')).toBe(true)
  })

  it('sends a change back to the server’s old picture while another value is on its way', () => {
    const unsent = guard()
    expect(unsent('a', 'b')).toBe(true)
    // The server's picture is still „a“: the save of „b“ has not come back.
    expect(unsent('a', 'a')).toBe(true)
    expect(unsent('a', 'a')).toBe(false)
  })

  it('does not send again what was sent and has landed', () => {
    const unsent = guard()
    expect(unsent('a', 'b')).toBe(true)
    expect(unsent('b', 'b')).toBe(false)
  })

  it('sends again what was sent but never landed', () => {
    const unsent = guard()
    expect(unsent('a', 'b')).toBe(true)
    // The save failed: the server still holds „a“, and the user confirms „b“ once more.
    expect(unsent('a', 'b')).toBe(true)
  })
})
