import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../test-msw-server'
import { createAppI18n } from '../../i18n/app-i18n'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { LoginScreen } from '../LoginScreen'

const BASE_URL = 'http://localhost:3000'
const NEUTRAL = 'Wenn es zu dieser Adresse ein Konto gibt, haben wir dir eine E-Mail geschickt.'

function renderLogin(props: { startWithForgot?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={createAppAuthClient(BASE_URL)}>
            <LoginScreen onDone={() => {}} showDeviceQr={false} {...props} />
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function openForm() {
  fireEvent.click(screen.getByTestId('login-passwort-vergessen'))
}

function requestSeen() {
  const bodies: unknown[] = []
  server.use(
    http.post(`${BASE_URL}/api/auth/request-password-reset`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ status: true, message: 'sent' })
    }),
  )
  return bodies
}

describe('Passwort vergessen (login)', () => {
  it('offers the link on the login form and opens the request form', () => {
    renderLogin()
    expect(screen.getByText('Passwort vergessen?')).toBeTruthy()
    openForm()
    expect(screen.getByTestId('passwort-vergessen-email')).toBeTruthy()
  })

  it('can open on the request form directly (expired link)', () => {
    renderLogin({ startWithForgot: true })
    expect(screen.getByTestId('passwort-vergessen-senden')).toBeTruthy()
  })

  it('sends the address with our reset page as the redirect and shows the neutral confirmation', async () => {
    const bodies = requestSeen()
    renderLogin()
    openForm()
    fireEvent.change(screen.getByTestId('passwort-vergessen-email'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByTestId('passwort-vergessen-senden'))
    expect((await screen.findByTestId('passwort-vergessen-bestaetigung')).textContent).toContain(NEUTRAL)
    expect(bodies).toEqual([{ email: 'a@b.de', redirectTo: `${window.location.origin}/passwort-zuruecksetzen` }])
  })

  it('shows the same confirmation when the server answers an unknown address with an error', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/request-password-reset`, () => HttpResponse.json({ code: 'USER_NOT_FOUND' }, { status: 400 })))
    renderLogin()
    openForm()
    fireEvent.change(screen.getByTestId('passwort-vergessen-email'), { target: { value: 'nobody@b.de' } })
    fireEvent.click(screen.getByTestId('passwort-vergessen-senden'))
    expect((await screen.findByTestId('passwort-vergessen-bestaetigung')).textContent).toContain(NEUTRAL)
  })

  it('refuses an address without @ before asking the server', () => {
    const bodies = requestSeen()
    renderLogin()
    openForm()
    fireEvent.change(screen.getByTestId('passwort-vergessen-email'), { target: { value: 'kein-mail' } })
    fireEvent.click(screen.getByTestId('passwort-vergessen-senden'))
    expect(screen.getByText('Das sieht noch nicht nach einer E-Mail aus.')).toBeTruthy()
    expect(bodies).toEqual([])
  })

  it('says so honestly on 429 and keeps the form', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/request-password-reset`, () => HttpResponse.json({ message: 'Too many requests' }, { status: 429 })))
    renderLogin()
    openForm()
    fireEvent.change(screen.getByTestId('passwort-vergessen-email'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByTestId('passwort-vergessen-senden'))
    expect(await screen.findByText(/Zu viele Anfragen/)).toBeTruthy()
    expect(screen.queryByTestId('passwort-vergessen-bestaetigung')).toBeNull()
  })

  it('does not claim a mail was sent when the server fails', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/request-password-reset`, () => HttpResponse.json({}, { status: 500 })))
    renderLogin()
    openForm()
    fireEvent.change(screen.getByTestId('passwort-vergessen-email'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByTestId('passwort-vergessen-senden'))
    await waitFor(() => expect(screen.getByText(/nicht geklappt/)).toBeTruthy())
    expect(screen.queryByTestId('passwort-vergessen-bestaetigung')).toBeNull()
  })

  it('goes back to the login form', () => {
    renderLogin()
    openForm()
    fireEvent.click(screen.getByTestId('passwort-vergessen-zurueck'))
    expect(screen.getByTestId('login-passwort-vergessen')).toBeTruthy()
  })
})
