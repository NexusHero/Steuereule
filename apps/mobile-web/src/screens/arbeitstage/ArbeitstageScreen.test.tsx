// Arbeitstage-Assistent-Screen (M4) — calendar logic from the core (no free text): the work-week
// pattern + vacation/sick/home-office days fold through `berechneWerktage` to a weekday/commute-day
// count, and a contradiction (more vacation than work days) is named, never clamped.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wochentageImJahr } from '@steuereule/core'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ArbeitstageScreen } from './ArbeitstageScreen'

function renderArbeitstage(onDone: () => void = () => {}, taxYear = 2026) {
  const i18n = createAppI18n('de')
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <ArbeitstageScreen taxYear={taxYear} onDone={onDone} />
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

  it('shows the facts saved last time instead of starting empty', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () =>
        HttpResponse.json({
          eingaben: { arbeitstage: [1, 2, 3, 4, 5], urlaubstage: 30, krankheitstage: 5, homeofficeTage: 20, einfacheKm: 30, verkehrsmittel: 'pkw', taetigkeitsstaette: 'Lörrach' },
          werktage: { wochentage: 261, werktage: 226, pendlertage: 206 },
          pendlerpauschale: 2019,
        }),
      ),
    )
    renderArbeitstage(() => {}, 2025)

    expect(((await screen.findByLabelText('Urlaubstage')) as HTMLInputElement).value).toBe('30')
    expect((screen.getByLabelText('Einfache Entfernung in km') as HTMLInputElement).value).toBe('30')
  })

  it('previews the Entfernungspauschale once distance and means of travel are known', async () => {
    renderArbeitstage(() => {}, 2025)

    fireEvent.change(await screen.findByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Eigenes Auto'))

    expect(await screen.findByText('1.175 €')).toBeTruthy()
  })

  it('saves the facts before moving on', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ eingaben: null, werktage: null, pendlerpauschale: null })
      }),
    )
    const onDone = vi.fn()
    renderArbeitstage(onDone, 2025)

    fireEvent.change(await screen.findByLabelText('Urlaubstage'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Eigenes Auto'))
    fireEvent.change(screen.getByLabelText('Arbeitsort (PLZ, Ort, Straße)'), { target: { value: '79539 Lörrach, Hauptstraße 1' } })
    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies).toEqual([
      { arbeitstage: [1, 2, 3, 4, 5], urlaubstage: 30, krankheitstage: 0, homeofficeTage: 0, einfacheKm: 15, verkehrsmittel: 'pkw', taetigkeitsstaette: '79539 Lörrach, Hauptstraße 1' },
    ])
  })
})
