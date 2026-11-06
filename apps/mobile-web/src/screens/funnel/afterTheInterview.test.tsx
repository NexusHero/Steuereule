import { describe, expect, it } from 'vitest'
import { viewAfterInterview } from './afterTheInterview'

describe('ansichtNachDemInterview', () => {
  it('shows the account wall only to someone who is definitely signed out', () => {
    const view = viewAfterInterview('ch', 'signed-out')

    expect(view).toBe('konto-wand')
  })

  it('decides nothing while the session is still loading', () => {
    const view = viewAfterInterview('ch', 'loading')

    expect(view).toBeNull()
  })

  it.each(['signed-in', 'unknown'] as const)('continues the CH path when the session is %s', (status) => {
    const view = viewAfterInterview('ch', status)

    expect(view).toBe('ch')
  })

  it('continues with the pension path', () => {
    const view = viewAfterInterview('rente', 'signed-in')

    expect(view).toBe('rente')
  })

  it('continues employees with the wage statement', () => {
    const view = viewAfterInterview('angestellte', 'signed-in')

    expect(view).toBe('lstb')
  })
})
