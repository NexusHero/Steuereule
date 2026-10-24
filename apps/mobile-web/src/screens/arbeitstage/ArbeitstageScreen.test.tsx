// Arbeitstage-Assistent-Screen (M4) — calendar logic from the core (no free text): the work-week
// pattern + vacation/sick/home-office days fold through `berechneWerktage` to a weekday/commute-day
// count, and a contradiction (more vacation than work days) is named, never clamped.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wochentageImJahr } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { ArbeitstageScreen } from './ArbeitstageScreen'

function renderArbeitstage() {
  const i18n = createAppI18n('de')
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <ArbeitstageScreen taxYear={2026} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('ArbeitstageScreen', () => {
  it('counts the default Mo–Fr work week from the real calendar (no free text)', async () => {
    renderArbeitstage()

    expect(await screen.findByText('Wochentage im Jahr')).toBeTruthy()
    // 2026 Mo–Fr, before any vacation/sick/home-office subtraction.
    const wochentage = wochentageImJahr(2026, [1, 2, 3, 4, 5])
    expect(screen.getAllByText(String(wochentage)).length).toBeGreaterThan(0)
  })

  it('names a widerspruch when vacation days exceed the work days, never clamps', async () => {
    renderArbeitstage()

    // 999 vacation days is far more than the Mo–Fr weekdays in any year.
    fireEvent.change(await screen.findByLabelText('Urlaubstage'), { target: { value: '999' } })
    expect(await screen.findByText('Das passt nicht zusammen.')).toBeTruthy()
  })

  it('subtracts vacation/sick/home-office days from the weekday count', async () => {
    renderArbeitstage()

    const urlaub = await screen.findByLabelText('Urlaubstage')
    fireEvent.change(urlaub, { target: { value: '10' } })
    const krank = screen.getByLabelText('Krankheitstage')
    fireEvent.change(krank, { target: { value: '5' } })

    const wochentage = wochentageImJahr(2026, [1, 2, 3, 4, 5])
    expect(screen.getAllByText(String(wochentage - 15)).length).toBeGreaterThan(0)
  })
})
