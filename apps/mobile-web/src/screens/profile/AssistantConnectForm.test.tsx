import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import type { AppAuthClient } from '../../auth/auth-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { AssistantConnectForm } from './AssistantConnectForm'

function renderForm($fetch: ReturnType<typeof vi.fn>) {
  return render(
    <AuthClientProvider client={{ $fetch } as unknown as AppAuthClient} apiBaseUrl="https://api.example.test">
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AssistantConnectForm />
        </ThemeProvider>
      </I18nextProvider>
    </AuthClientProvider>,
  )
}

describe('AssistantConnectForm (ADR-0052 amendment 4: the signed-in user registers the client)', () => {
  it('registers a public client for Claude and shows what to paste into the assistant', async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: { client_id: 'client-abc' }, error: null })
    renderForm($fetch)
    fireEvent.click(screen.getByTestId('assistent-art-claude'))
    fireEvent.click(screen.getByTestId('assistent-anlegen'))
    await waitFor(() => expect(screen.getByTestId('assistent-client-id').textContent).toBe('client-abc'))
    expect(screen.getByTestId('assistent-server-adresse').textContent).toBe('https://api.example.test/mcp')
    expect($fetch).toHaveBeenCalledWith('/oauth2/register', {
      method: 'POST',
      body: expect.objectContaining({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    })
  })

  it('takes an own name and redirect address for another assistant, and refuses an address that is neither https nor local', async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: { client_id: 'client-own' }, error: null })
    renderForm($fetch)
    fireEvent.click(screen.getByTestId('assistent-art-anderer'))
    fireEvent.change(screen.getByTestId('assistent-name'), { target: { value: 'Mein Agent' } })
    fireEvent.change(screen.getByTestId('assistent-redirect'), { target: { value: 'http://evil.example/cb' } })
    fireEvent.click(screen.getByTestId('assistent-anlegen'))
    expect(await screen.findByText('Die Rückruf-Adresse muss mit https:// beginnen oder auf diesen Rechner zeigen (http://localhost oder http://127.0.0.1).')).toBeTruthy()
    expect($fetch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('assistent-redirect'), { target: { value: 'http://localhost:9999/callback' } })
    fireEvent.click(screen.getByTestId('assistent-anlegen'))
    await waitFor(() => expect($fetch).toHaveBeenCalledWith('/oauth2/register', { method: 'POST', body: expect.objectContaining({ client_name: 'Mein Agent', redirect_uris: ['http://localhost:9999/callback'] }) }))
  })

  it('says so when the registration fails', async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: null, error: { code: 'UNAUTHORIZED' } })
    renderForm($fetch)
    fireEvent.click(screen.getByTestId('assistent-art-claude'))
    fireEvent.click(screen.getByTestId('assistent-anlegen'))
    expect(await screen.findByText('Der Assistent konnte nicht angelegt werden. Bitte erneut versuchen.')).toBeTruthy()
  })

  it('WEB-10: a throttled registration (429) says to wait, not "Bitte erneut versuchen" at once', async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: null, error: { status: 429 } })
    renderForm($fetch)
    fireEvent.click(screen.getByTestId('assistent-art-claude'))
    fireEvent.click(screen.getByTestId('assistent-anlegen'))
    expect(await screen.findByText('Gerade kommen zu viele Anfragen. Versuch es in ein paar Minuten noch mal.')).toBeTruthy()
  })
})
