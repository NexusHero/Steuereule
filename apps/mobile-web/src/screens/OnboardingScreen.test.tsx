import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../i18n/app-i18n'
import { OnboardingScreen } from './OnboardingScreen'

function renderOnboarding(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <OnboardingScreen onDone={opts.onDone ?? (() => {})} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

function fillNameStep() {
  fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
  fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
  fireEvent.click(screen.getByText('Weiter'))
}

function fillSteuerId(digits: string) {
  fireEvent.change(screen.getByPlaceholderText('12 345 678 901'), { target: { value: digits } })
}

describe('OnboardingScreen', () => {
  it('renders step 1 in German by default', () => {
    renderOnboarding()
    expect(screen.getByText('Genau wie im Ausweis — damit die Maske exakt stimmt.')).toBeTruthy()
    expect(screen.getByText('Vorname')).toBeTruthy()
    expect(screen.getByText('Nachname')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', () => {
    renderOnboarding({ lng: 'en' })
    expect(screen.getByText('Just like on your ID — so the form matches exactly.')).toBeTruthy()
    expect(screen.getByText('First name')).toBeTruthy()
  })

  it('keeps the step-1 CTA disabled until both name fields are filled', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Weiter'))
    // Still on step 1: the step-2 help text must not have appeared.
    expect(screen.queryByText('11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
    fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.')).toBeTruthy()
  })

  it('formats the Steuer-ID live, shows the running counter, and confirms at exactly 11 digits', () => {
    renderOnboarding()
    fillNameStep()

    fillSteuerId('1234567890')
    expect(screen.getByText('10/11 Ziffern')).toBeTruthy()
    expect(screen.queryByText('sitzt ✓')).toBeNull()
    fireEvent.click(screen.getByText('Weiter'))
    // CTA stayed disabled: still on step 2.
    expect(screen.queryByText('Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.')).toBeNull()

    fillSteuerId('12345678901')
    expect(screen.getByDisplayValue('12 345 678 901')).toBeTruthy()
    expect(screen.getByText('11/11 Ziffern')).toBeTruthy()
    expect(screen.getByText('sitzt ✓')).toBeTruthy()
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.')).toBeTruthy()
  })

  it('lets the Steuernummer step be skipped via the "later" chip without entering digits', () => {
    renderOnboarding()
    fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))

    fireEvent.click(screen.getByText('Hab ich nicht zur Hand — später'))
    expect(screen.getByText('Deine Maske')).toBeTruthy()
  })

  it('reaches the summary with all four values, showing "später" for a skipped Steuernummer', () => {
    renderOnboarding()
    fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    // Steuernummer is never required: tap Weiter with the field left empty.
    fireEvent.click(screen.getByText('Weiter'))

    expect(screen.getByText('Deine Maske')).toBeTruthy()
    expect(screen.getByText('Kim')).toBeTruthy()
    expect(screen.getByText('Yilmaz')).toBeTruthy()
    expect(screen.getByText('12 345 678 901')).toBeTruthy()
    expect(screen.getByText('später')).toBeTruthy()
  })

  it('returns to step 1 from "Angaben ändern" and calls onDone once from the summary CTA', () => {
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('Deine Maske')).toBeTruthy()

    fireEvent.click(screen.getByText('Angaben ändern'))
    expect(screen.getByText('Vorname')).toBeTruthy()
    expect(screen.getByPlaceholderText('Kim')).toHaveProperty('value', 'Kim')

    fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('lets the back arrow decrement the step while preserving entered values', () => {
    renderOnboarding()
    fillNameStep()
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(screen.getByPlaceholderText('Kim')).toHaveProperty('value', 'Kim')
    expect(screen.getByPlaceholderText('Yilmaz')).toHaveProperty('value', 'Yilmaz')
  })

  it('exposes the back button label and progressbar semantics on the step indicator', () => {
    renderOnboarding()
    fillNameStep()
    const back = screen.getByLabelText('Zurück')
    expect(back.getAttribute('role')).toBe('button')

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('3')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
  })
})
