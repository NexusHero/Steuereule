// The security screen's every stage and error: the signed-out and loading states, a wrong password or
// code shown on the field, the busy state, disabling the factor, and the passkey list failing or changing.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'

const mocks = vi.hoisted(() => ({
  session: { state: { status: 'loading' } as unknown },
  twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), verifyBackupCode: vi.fn(), disable: vi.fn() },
  passkey: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../auth/useAccountSession', () => ({ useAccountSession: () => ({ state: mocks.session.state }) }))
vi.mock('../../auth/useTwoFactor', () => ({ useTwoFactor: () => mocks.twoFactor }))
vi.mock('../../auth/usePasskey', () => ({ usePasskey: () => mocks.passkey }))

import { SecurityScreen } from './SecurityScreen'

const signedIn = (twoFactorEnabled: boolean | undefined) => ({ status: 'signed-in', session: { user: { twoFactorEnabled } } })
const defer = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function renderScreen(onBack = () => {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <SecurityScreen onBack={onBack} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  Object.values(mocks.twoFactor).forEach((m) => m.mockReset())
  Object.values(mocks.passkey).forEach((m) => m.mockReset())
  mocks.passkey.list.mockResolvedValue([])
})

describe('SecurityScreen without an account', () => {
  it('shows a loading indicator while the session is read', () => {
    mocks.session.state = { status: 'loading' }
    renderScreen()
    expect(screen.getByLabelText('Wird geladen …')).toBeTruthy()
    expect(mocks.passkey.list).not.toHaveBeenCalled()
  })

  it.each(['signed-out', 'unknown'])('says two-factor needs a real account when the session is %s', (status) => {
    mocks.session.state = { status }
    const onBack = vi.fn()
    renderScreen(onBack)
    expect(screen.getByText(/gibt es nur für ein echtes Konto/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Zurück zu Profil'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('enabling two-factor', () => {
  beforeEach(() => {
    mocks.session.state = signedIn(false)
  })

  it('shows a wrong password on the field and lets the user try again', async () => {
    mocks.twoFactor.enable.mockResolvedValue('Das Passwort ist nicht richtig.')
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-einrichten'))
    fireEvent.change(screen.getByTestId('zweifaktor-passwort'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByTestId('zweifaktor-passwort-weiter'))

    expect(await screen.findByText('Das Passwort ist nicht richtig.')).toBeTruthy()
    expect(screen.getByTestId('zweifaktor-passwort')).toBeTruthy()
  })

  it('keeps the confirm button disabled until a password is typed', async () => {
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-einrichten'))
    const button = screen.getByTestId('zweifaktor-passwort-weiter') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(mocks.twoFactor.enable).not.toHaveBeenCalled()
  })

  it('shows a busy state while the password is checked', async () => {
    const pending = defer<string>()
    mocks.twoFactor.enable.mockReturnValue(pending.promise)
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-einrichten'))
    fireEvent.change(screen.getByTestId('zweifaktor-passwort'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByTestId('zweifaktor-passwort-weiter'))
    expect(await screen.findByText('Wird geprüft …')).toBeTruthy()
    pending.resolve('Das Passwort ist nicht richtig.')
    await screen.findByText('Das Passwort ist nicht richtig.')
  })

  it('shows a wrong code on the code field and keeps the setup', async () => {
    mocks.twoFactor.enable.mockResolvedValue({ totpURI: 'otpauth://x', backupCodes: ['a-1'] })
    mocks.twoFactor.verifyTotp.mockResolvedValue('Dieser Code ist nicht richtig. Prüf die App und versuch es noch mal.')
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-einrichten'))
    fireEvent.change(screen.getByTestId('zweifaktor-passwort'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByTestId('zweifaktor-passwort-weiter'))
    await screen.findByTestId('zweifaktor-totp-uri')

    expect((screen.getByTestId('zweifaktor-code-bestaetigen') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('zweifaktor-code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByTestId('zweifaktor-code-bestaetigen'))

    expect(await screen.findByText(/Dieser Code ist nicht richtig/)).toBeTruthy()
    expect(screen.getByTestId('zweifaktor-totp-uri')).toBeTruthy()
  })
})

describe('disabling two-factor', () => {
  beforeEach(() => {
    mocks.session.state = signedIn(true)
  })

  it('shows the factor as on and asks for the password again', async () => {
    renderScreen()
    expect(screen.getByText('Aktiv')).toBeTruthy()
    fireEvent.click(screen.getByTestId('zweifaktor-abschalten'))
    expect(await screen.findByText('Passwort bestätigen')).toBeTruthy()
    expect((screen.getByTestId('zweifaktor-abschalten-bestaetigen') as HTMLButtonElement).disabled).toBe(true)
  })

  it('names a wrong password and keeps asking', async () => {
    mocks.twoFactor.disable.mockResolvedValue('Das Passwort ist nicht richtig.')
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-abschalten'))
    fireEvent.change(screen.getByTestId('zweifaktor-passwort'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByTestId('zweifaktor-abschalten-bestaetigen'))
    expect(await screen.findByText('Das Passwort ist nicht richtig.')).toBeTruthy()
  })

  it('confirms when the factor is gone', async () => {
    mocks.twoFactor.disable.mockResolvedValue(null)
    renderScreen()
    fireEvent.click(screen.getByTestId('zweifaktor-abschalten'))
    fireEvent.change(screen.getByTestId('zweifaktor-passwort'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByTestId('zweifaktor-abschalten-bestaetigen'))
    expect(await screen.findByText('Zwei-Faktor-Authentifizierung ist aus.')).toBeTruthy()
  })

  it('treats a session without the flag as off', () => {
    mocks.session.state = signedIn(undefined)
    renderScreen()
    expect(screen.getByText('Aus')).toBeTruthy()
  })
})

describe('passkeys', () => {
  beforeEach(() => {
    mocks.session.state = signedIn(false)
  })

  it('says when the list could not be loaded', async () => {
    mocks.passkey.list.mockResolvedValue('Das hat nicht geklappt. Versuch es noch einmal.')
    renderScreen()
    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch einmal.')).toBeTruthy()
    expect(screen.getByText('Wird geladen …')).toBeTruthy()
  })

  it('says there are none yet, adds one, confirms and reloads the list', async () => {
    mocks.passkey.list.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: '1', name: null, deviceType: 'x', createdAt: '2026-01-01' }])
    mocks.passkey.add.mockResolvedValue(null)
    renderScreen()
    expect(await screen.findByText('Noch keine Passkeys eingerichtet.')).toBeTruthy()

    fireEvent.click(screen.getByText('Passkey hinzufügen'))

    expect(await screen.findByText('Passkey wurde hinzugefügt.')).toBeTruthy()
    expect(await screen.findByText('Passkey')).toBeTruthy()
  })

  it('shows why adding failed and keeps the list', async () => {
    mocks.passkey.add.mockResolvedValue('Abgebrochen.')
    renderScreen()
    await screen.findByText('Noch keine Passkeys eingerichtet.')
    fireEvent.click(screen.getByText('Passkey hinzufügen'))
    expect(await screen.findByText('Abgebrochen.')).toBeTruthy()
    expect(mocks.passkey.list).toHaveBeenCalledTimes(1)
  })

  it('removes a passkey, and shows why removing failed', async () => {
    mocks.passkey.list.mockResolvedValue([{ id: '1', name: 'Laptop', deviceType: 'x', createdAt: '2026-01-01' }])
    mocks.passkey.remove.mockResolvedValueOnce('Das hat nicht geklappt. Versuch es noch einmal.').mockResolvedValueOnce(null)
    renderScreen()
    fireEvent.click(await screen.findByText('Entfernen'))
    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch einmal.')).toBeTruthy()

    fireEvent.click(screen.getByText('Entfernen'))
    expect(await screen.findByText('Passkey wurde entfernt.')).toBeTruthy()
    await waitFor(() => expect(mocks.passkey.remove).toHaveBeenCalledTimes(2))
  })

  it('ignores a second press while one change is running', async () => {
    const pending = defer<string | null>()
    mocks.passkey.add.mockReturnValue(pending.promise)
    renderScreen()
    await screen.findByText('Noch keine Passkeys eingerichtet.')
    const button = screen.getByText('Passkey hinzufügen')
    fireEvent.click(button)
    expect(await screen.findAllByText('Wird geprüft …')).toBeTruthy()
    expect(mocks.passkey.add).toHaveBeenCalledTimes(1)
    pending.resolve(null)
    await screen.findByText('Passkey wurde hinzugefügt.')
  })
})
