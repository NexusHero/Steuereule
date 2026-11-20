import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { AdvisorConnection } from '@steuereule/core'
import { renderInApp } from '../../../test-render'
import { ConnectionChip, ConnectionDetails, toneOf, type ConnectionView } from './ConnectionStatus'

const rules: ConnectionView = {
  kind: 'model',
  connection: { state: 'rules-only', provider: null, model: null, checkedAt: '2026-11-12T11:30:00.000Z' } satisfies AdvisorConnection,
}

describe('the connection status without a model behind it', () => {
  it('has a quiet dot and no provider in the word when the chat runs on the fixed rules', () => {
    renderInApp(<ConnectionChip view={rules} compact={false} onPress={vi.fn()} />)
    expect(screen.getByTestId('eule-connection-dot-idle')).toBeDefined()
    expect(screen.getByTestId('eule-connection-label').textContent).not.toContain('·')
  })

  it('shows no model line for the fixed rules, but still when the check happened', () => {
    renderInApp(<ConnectionDetails view={rules} onRecheck={vi.fn()} rechecking={false} />)
    expect(screen.queryByTestId('eule-connection-model')).toBeNull()
    expect(screen.queryByTestId('eule-connection-failure')).toBeNull()
    expect(screen.getByTestId('eule-connection-details').textContent).toMatch(/\d{2}:\d{2}/)
  })

  it('names the provider even when the model name is unknown', () => {
    const view: ConnectionView = { kind: 'model', connection: { state: 'connected', provider: 'Gemini', model: null, checkedAt: '2026-11-12T11:30:00.000Z' } }
    renderInApp(<ConnectionDetails view={view} onRecheck={vi.fn()} rechecking={false} />)
    expect(screen.getByTestId('eule-connection-model').textContent).toContain('Gemini')
  })

  it('says the failure without a technical detail when there is none, and in English for an English reader', () => {
    const view: ConnectionView = {
      kind: 'model',
      connection: { state: 'degraded', provider: 'Gemini', model: 'g', failure: { reason: 'quota' }, checkedAt: '2026-11-12T16:05:00.000Z' },
    }
    renderInApp(<ConnectionDetails view={view} onRecheck={vi.fn()} rechecking={false} />, { language: 'en' })
    expect(screen.getByTestId('eule-connection-failure').textContent).not.toContain('(')
    expect(screen.getByTestId('eule-connection-details').textContent).toMatch(/\d{2}:\d{2}/)
  })

  it('treats a view that is still being restored as a warning', () => {
    expect(toneOf({ kind: 'restoring' })).toBe('warn')
    renderInApp(<ConnectionChip view={{ kind: 'restoring' }} compact onPress={vi.fn()} />)
    expect(screen.getByTestId('eule-connection-dot-warn')).toBeDefined()
  })
})
