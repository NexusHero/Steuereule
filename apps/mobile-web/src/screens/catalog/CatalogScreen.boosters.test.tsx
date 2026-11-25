import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { CatalogScreen } from './CatalogScreen'
import type { CatalogEntryParam } from '../../navigation/routes'
import { renderWithQuery } from '../../test-render'

const TAX_YEAR = 2025

function renderCatalog(entry: CatalogEntryParam, opts: { onDone?: () => void } = {}) {
  return renderWithQuery(<CatalogScreen entry={entry} taxYear={TAX_YEAR} onDone={opts.onDone ?? (() => {})} />)
}

/**
 * Serves the gate question of a booster entry (checking the catalog asked for that entry) and
 * records every answer POSTed; each answer completes the entry.
 */
function mockEntryOnItsGate(expectedEntry: 'haushalt' | 'gesundheit') {
  const posted: unknown[] = []
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, ({ request }) => {
      const entry = new URL(request.url).searchParams.get('eintrag')
      expect(entry).toBe(expectedEntry)
      return HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: `${expectedEntry}-gate` }, openItems: 1 }, { status: 200 })
    }),
    http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
      posted.push(await request.json())
      return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
    }),
  )
  return posted
}

describe('CatalogScreen — Slice 5 boosters (haushalt & gesundheit)', () => {
  it('renders haushalt-gate with hint under question and walks amount steps including AMOUNT_LATER', async () => {
    const posted = mockEntryOnItsGate('haushalt')
    const onDone = vi.fn()

    renderCatalog('haushalt', { onDone })

    expect(
      await screen.findByText(
        'Hattest du Kosten für Handwerker, Haushaltshilfe oder Dienstleistungen rund um die Wohnung, auch aus der Nebenkostenabrechnung?',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('katalog-hinweis-haushalt-gate').textContent).toBe(
      'Nur Arbeits-, Maschinen- und Fahrtkosten zählen, kein Material. Bezahlt per Überweisung, nicht bar.',
    )

    fireEvent.click(screen.getByTestId('katalog-option-haushalt-gate-Ja'))

    const serviceInput = await screen.findByTestId('katalog-input-haushalt-dienstleistung-betrag')
    fireEvent.change(serviceInput, { target: { value: '1200' } })
    fireEvent.click(screen.getByTestId('katalog-submit-haushalt-dienstleistung-betrag'))

    await screen.findByTestId('katalog-input-haushalt-handwerker-betrag')
    fireEvent.click(screen.getByTestId('katalog-later-haushalt-handwerker-betrag'))

    // The invoices' total behind the labour share (Z. 6 of the form, ADR-0078).
    await screen.findByTestId('katalog-input-haushalt-handwerker-rechnungsbetrag')
    fireEvent.click(screen.getByTestId('katalog-later-haushalt-handwerker-rechnungsbetrag'))

    const minijobInput = await screen.findByTestId('katalog-input-haushalt-minijob-betrag')
    fireEvent.change(minijobInput, { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('katalog-submit-haushalt-minijob-betrag'))

    await waitFor(() =>
      expect(posted).toEqual([
        { questionId: 'haushalt-gate', value: 'Ja' },
        { questionId: 'haushalt-dienstleistung-betrag', value: '1200' },
        { questionId: 'haushalt-handwerker-betrag', value: 'spaeter' },
        { questionId: 'haushalt-handwerker-rechnungsbetrag', value: 'spaeter' },
        { questionId: 'haushalt-minijob-betrag', value: '0' },
      ]),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('walks gesundheit entry and completes when gesundheit-betrag is submitted or Nein is chosen', async () => {
    const posted = mockEntryOnItsGate('gesundheit')
    const onDone = vi.fn()

    renderCatalog('gesundheit', { onDone })

    expect(
      await screen.findByText('Hattest du selbst bezahlte Krankheitskosten (Zuzahlungen, Brille, Zahnersatz, Medikamente auf Rezept)?'),
    ).toBeTruthy()
    expect(screen.queryByTestId('katalog-hinweis-gesundheit-gate')).toBeNull()

    fireEvent.click(screen.getByTestId('katalog-option-gesundheit-gate-Ja'))

    const medicalInput = await screen.findByTestId('katalog-input-gesundheit-betrag')
    expect(screen.queryByTestId('katalog-later-gesundheit-betrag')).toBeNull()
    fireEvent.change(medicalInput, { target: { value: '2500' } })
    fireEvent.click(screen.getByTestId('katalog-submit-gesundheit-betrag'))
    // Then what was reimbursed (ADR-0090).
    const reimbursed = await screen.findByTestId('katalog-input-gesundheit-erstattung')
    fireEvent.change(reimbursed, { target: { value: '600' } })
    fireEvent.click(screen.getByTestId('katalog-submit-gesundheit-erstattung'))

    await waitFor(() =>
      expect(posted).toEqual([
        { questionId: 'gesundheit-gate', value: 'Ja' },
        { questionId: 'gesundheit-betrag', value: '2500' },
        { questionId: 'gesundheit-erstattung', value: '600' },
      ]),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})
