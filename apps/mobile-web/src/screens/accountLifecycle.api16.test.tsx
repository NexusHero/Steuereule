// API-16 (ADR-0030): a never-verified account is told on every screen when it will be deleted and is offered
// the export first; the verification link of a removed account says the account is gone and offers a new
// registration, not "link expired".
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { fireEvent, screen } from '@testing-library/react'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { server } from '../test-msw-server'
import { renderWithQuery } from '../test-render'

const session = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }))
vi.mock('../auth/useAccountSession', () => ({ useAccountSession: () => ({ state: session.state }) }))

import { LoginScreen } from './LoginScreen'
import { UnverifiedAccountBanner, deletionDateText } from './shared/UnverifiedAccountBanner'

const signedIn = (emailVerified: boolean) => ({ status: 'signed-in', session: { user: { email: 'kim@beispiel.de', emailVerified } } })

function wrap(children: ReactNode) {
  return <AuthClientProvider client={createAppAuthClient('http://localhost:3000')}>{children}</AuthClientProvider>
}

describe('the banner of a never-verified account (ADR-0030 §2)', () => {
  it('names the date no sooner than which the account is deleted and opens the export', async () => {
    session.state = signedIn(false)
    server.use(http.get('*/v1/account/verification', () => HttpResponse.json({ emailVerified: false, deletionNotBefore: '2026-12-01T10:00:00.000Z' })))
    const onOpenExport = vi.fn()
    renderWithQuery(wrap(<UnverifiedAccountBanner onOpenExport={onOpenExport} />))
    expect(await screen.findByText(/frühestens am 1\. Dezember 2026/)).toBeTruthy()
    expect(screen.getByText(/kim@beispiel\.de/)).toBeTruthy()
    fireEvent.click(screen.getByText('Vorher deine Daten exportieren'))
    expect(onOpenExport).toHaveBeenCalledTimes(1)
  })

  it('is not there for a confirmed address, and asks nothing', () => {
    session.state = signedIn(true)
    const asked = vi.fn()
    server.use(http.get('*/v1/account/verification', () => {
      asked()
      return HttpResponse.json({ emailVerified: true, deletionNotBefore: null })
    }))
    renderWithQuery(wrap(<UnverifiedAccountBanner onOpenExport={() => {}} />))
    expect(screen.queryByTestId('konto-unbestaetigt')).toBeNull()
    expect(asked).not.toHaveBeenCalled()
  })

  it('reads the date as a Berlin calendar day', () => {
    expect(deletionDateText('2026-11-30T23:30:00.000Z', 'de')).toBe('1. Dezember 2026')
  })
})

describe('the verification link of a removed account (ADR-0030 §5)', () => {
  it('says the account is gone and offers a new registration instead of "link expired"', () => {
    session.state = { status: 'signed-out' }
    const onRegister = vi.fn()
    renderWithQuery(wrap(<LoginScreen onDone={() => {}} onRegister={onRegister} showDeviceQr={false} accountRemoved />))
    expect(screen.getByTestId('konto-entfernt')).toBeTruthy()
    expect(screen.queryByTestId('email-link-abgelaufen')).toBeNull()
    fireEvent.click(screen.getByTestId('konto-entfernt-registrieren'))
    expect(onRegister).toHaveBeenCalledTimes(1)
  })
})
