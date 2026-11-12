import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorConnection } from '@steuereule/core'
import { renderInApp } from '../../../test-render'
import { ConnectionChip, ConnectionDetails, labelKeyOf, toneOf, type ConnectionView } from './ConnectionStatus'

const model = (connection: Partial<AdvisorConnection> & Pick<AdvisorConnection, 'state'>): ConnectionView => ({
  kind: 'model',
  connection: { provider: 'Gemini', model: 'gemini-test', checkedAt: '2026-11-12T11:30:00.000Z', ...connection },
})

describe('what the connection status says (#488)', () => {
  it.each([
    [model({ state: 'connected' }), 'ok'],
    [model({ state: 'degraded' }), 'warn'],
    [model({ state: 'unavailable' }), 'bad'],
    [model({ state: 'rules-only', provider: null, model: null }), 'idle'],
    [{ kind: 'offline' } as const, 'bad'],
    [{ kind: 'restoring' } as const, 'warn'],
    [{ kind: 'checking' } as const, 'idle'],
  ])('colours %j as %s', (view, tone) => {
    expect(toneOf(view)).toBe(tone)
  })

  it('uses the state of the model as its label, and its own kind otherwise', () => {
    expect(labelKeyOf(model({ state: 'unavailable' }))).toBe('unavailable')
    expect(labelKeyOf({ kind: 'offline' })).toBe('offline')
  })

  it('shows a dot and a word, and the word says which provider', () => {
    renderInApp(<ConnectionChip view={model({ state: 'connected' })} compact={false} onPress={vi.fn()} />)
    expect(screen.getByTestId('eule-connection-dot-ok')).toBeTruthy()
    expect(screen.getByTestId('eule-connection-label').textContent).toBe('Verbunden · Gemini')
  })

  it('is only a dot on a phone, but still named for screen readers', () => {
    renderInApp(<ConnectionChip view={model({ state: 'unavailable' })} compact onPress={vi.fn()} />)
    expect(screen.queryByTestId('eule-connection-label')).toBeNull()
    expect(screen.getByTestId('eule-connection-chip').getAttribute('aria-label')).toContain('Sprachmodell nicht erreichbar')
  })

  it('opens the details when pressed', () => {
    const onPress = vi.fn()
    renderInApp(<ConnectionChip view={{ kind: 'offline' }} compact={false} onPress={onPress} />)
    fireEvent.click(screen.getByTestId('eule-connection-chip'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('explains in the details why the model is not reachable, with the technical status and the time of the check', () => {
    renderInApp(<ConnectionDetails view={model({ state: 'unavailable', failure: { reason: 'quota', detail: 'Gemini · HTTP 429' } })} onRecheck={vi.fn()} rechecking={false} />)
    expect(screen.getByTestId('eule-connection-explain').textContent).toContain('festen Regeln')
    expect(screen.getByTestId('eule-connection-failure').textContent).toContain('Kontingent')
    expect(screen.getByTestId('eule-connection-failure').textContent).toContain('HTTP 429')
    expect(screen.getByTestId('eule-connection-model').textContent).toContain('gemini-test')
  })

  it('asks for a new check, and not twice while one runs', () => {
    const onRecheck = vi.fn()
    const { unmount } = renderInApp(<ConnectionDetails view={model({ state: 'connected' })} onRecheck={onRecheck} rechecking={false} />)
    fireEvent.click(screen.getByTestId('eule-connection-recheck'))
    expect(onRecheck).toHaveBeenCalledTimes(1)
    unmount()
    renderInApp(<ConnectionDetails view={model({ state: 'connected' })} onRecheck={onRecheck} rechecking />)
    fireEvent.click(screen.getByTestId('eule-connection-recheck'))
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })

  it('names a server that does not answer, in words that do not blame the model', () => {
    renderInApp(<ConnectionDetails view={{ kind: 'offline' }} onRecheck={vi.fn()} rechecking={false} />)
    expect(screen.getByTestId('eule-connection-explain').textContent).toContain('Server')
    expect(screen.queryByTestId('eule-connection-model')).toBeNull()
  })
})
