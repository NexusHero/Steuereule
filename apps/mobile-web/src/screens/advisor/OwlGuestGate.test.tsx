import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInApp } from '../../test-render'
import { OwlModeScreen } from './OwlModeScreen'

describe('the owl for a guest', () => {
  it('asks for an account instead of starting the owl, and leads back to the cockpit', () => {
    const onDone = vi.fn()
    renderInApp(<OwlModeScreen taxYear={2026} isGuest onDone={onDone} />)
    expect(screen.getByTestId('eule-guest-konto-wand').textContent).toContain('Konto')
    expect(screen.queryByTestId('eule-guest-register-btn')).toBeNull()
    expect(screen.queryByTestId('eule-guest-login-btn')).toBeNull()
    expect(screen.queryByLabelText('Zurück')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-guest-back-btn'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('offers registration, login and the way back when the app gives them', () => {
    const onRegister = vi.fn()
    const onLogin = vi.fn()
    const onBack = vi.fn()
    renderInApp(<OwlModeScreen taxYear={2026} isGuest onRegister={onRegister} onLogin={onLogin} onBack={onBack} />)
    fireEvent.click(screen.getByTestId('eule-guest-register-btn'))
    fireEvent.click(screen.getByTestId('eule-guest-login-btn'))
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onRegister).toHaveBeenCalledOnce()
    expect(onLogin).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('leaves without a handler for "back to the cockpit" without failing', () => {
    renderInApp(<OwlModeScreen taxYear={2026} isGuest />)
    expect(() => fireEvent.click(screen.getByTestId('eule-guest-back-btn'))).not.toThrow()
  })
})
