import { describe, expect, it } from 'vitest'
import { ansichtNachDemInterview } from './nachDemInterview'

describe('ansichtNachDemInterview', () => {
  it('shows the account wall only to someone who is definitely signed out', () => {
    const ansicht = ansichtNachDemInterview('ch', 'signed-out')

    expect(ansicht).toBe('konto-wand')
  })

  it.each(['signed-in', 'loading', 'unknown'] as const)('continues the CH path when the session is %s', (status) => {
    const ansicht = ansichtNachDemInterview('ch', status)

    expect(ansicht).toBe('ch')
  })

  it('continues with the pension path', () => {
    const ansicht = ansichtNachDemInterview('rente', 'signed-in')

    expect(ansicht).toBe('rente')
  })

  it('continues employees with the wage statement', () => {
    const ansicht = ansichtNachDemInterview('angestellte', 'signed-in')

    expect(ansicht).toBe('lstb')
  })
})
