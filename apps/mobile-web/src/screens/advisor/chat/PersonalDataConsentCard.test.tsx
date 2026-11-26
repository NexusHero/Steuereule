import { modelProviderList } from '@steuereule/core'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/test-msw-server'
import { PersonalDataConsentCard } from './PersonalDataConsentCard'
import { renderWithQuery } from '../../../../test/test-render'

const URL_PATTERN = '*/v1/eulen-modus/personendaten-einwilligung'

function renderCard(onGranted?: () => void, provider?: string | null) {
  return renderWithQuery(<PersonalDataConsentCard onGranted={onGranted} {...(provider !== undefined ? { provider } : {})} />)
}

describe('PersonalDataConsentCard (ADR-0091)', () => {
  it('names every provider the API can call, whatever model this conversation asks (LEGAL-2)', async () => {
    // One consent covers all providers: a fallback or a model choice may send the data to another one.
    for (const provider of ['anthropic', 'openai', 'google-genai', null]) {
      const view = renderCard(undefined, provider)
      expect(await screen.findByText(new RegExp(modelProviderList().replace(/[()]/g, '\\$&')))).toBeTruthy()
      expect(screen.getByText(/Deine Einwilligung gilt für alle diese Anbieter/)).toBeTruthy()
      view.unmount()
    }
  })

  it('asks for consent while it is not granted', async () => {
    renderCard(undefined, 'google-genai')
    expect(await screen.findByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeTruthy()
    expect(screen.getByText(/Google \(Gemini, USA\)/)).toBeTruthy()
    expect(screen.getByText(/Art\. 9 DSGVO/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erlauben' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nicht erlauben' })).toBeTruthy()
  })

  it('is not shown when consent is already granted', async () => {
    server.use(http.get(URL_PATTERN, () => HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })))
    renderCard()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Erlauben' })).toBeNull())
    expect(screen.queryByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeNull()
  })

  it('sends granted:true on Erlauben and then shows the granted state', async () => {
    let body: unknown = null
    server.use(
      http.put(URL_PATTERN, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })
      }),
    )
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    await waitFor(() => expect(body).toEqual({ granted: true }))
    expect(await screen.findByText(/Erlaubt\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Erlauben' })).toBeNull()
  })

  it('hides itself on Nicht erlauben without sending anything', async () => {
    let put = false
    server.use(http.put(URL_PATTERN, () => { put = true; return HttpResponse.json({ granted: false, version: '1', grantedAt: null }) }))
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Nicht erlauben' }))
    expect(screen.queryByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeNull()
    expect(put).toBe(false)
  })

  it('tells the chat once the consent is stored, so the conversation goes on by itself', async () => {
    server.use(http.put(URL_PATTERN, () => HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })))
    const onGranted = vi.fn()
    renderCard(onGranted)
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/macht mit deiner letzten Nachricht weiter/)).toBeTruthy()
  })

  it('does not continue when storing the consent failed', async () => {
    server.use(http.put(URL_PATTERN, () => HttpResponse.json({}, { status: 500 })))
    const onGranted = vi.fn()
    renderCard(onGranted)
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    expect(await screen.findByText('Das hat nicht geklappt. Bitte versuche es noch einmal.')).toBeTruthy()
    expect(onGranted).not.toHaveBeenCalled()
  })
})
