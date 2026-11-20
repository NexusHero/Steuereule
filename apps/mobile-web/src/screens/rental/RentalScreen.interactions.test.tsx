// Vermietung — the paths the main test file leaves out: the load error, the open-classification
// detour into the catalogue, the "unlesbar" answer, every address field, the joint-return share,
// the date/repairs edge cases and the honest status block.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { RentalPropertyDto, RentalResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { RentalScreen } from './RentalScreen'
import { server } from '../../test-msw-server'

const TAX_YEAR = 2026
const RENTAL_URL = `*/v1/steuerjahre/${TAX_YEAR}/vermietung`

const PROPERTY: RentalPropertyDto = {
  id: 'obj-1',
  mieteinnahmen: { kind: 'erfasst', value: 12000 },
  anschaffungskosten: { kind: 'offen' },
  baujahr: { kind: 'offen' },
  werbungskosten: { kind: 'offen' },
  strasse: 'Hauptstraße',
  hausnummer: '12',
  plz: '50667',
  city: 'Köln',
  livingArea: '85',
  depreciationAsLastYear: false,
  umlagen: null,
  schuldzinsen: null,
  einheiten: null,
  anteilA: null,
  propertyKey: 'obj-1',
  anschaffungsdatum: '2024-04-01',
  erhaltungsaufwand: [{ betrag: 800, datum: '2026-02-01' }],
  facts: { einnahmen: null, werbungskosten: null, depreciation: null, openItems: 3 },
} as RentalPropertyDto

function response(over: Partial<RentalResponseDto> = {}, property: Partial<RentalPropertyDto> = {}): RentalResponseDto {
  return {
    classification: { kind: 'einfach' },
    properties: [{ ...PROPERTY, ...property }],
    status: { kind: 'offen', einnahmen: 12000, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 2, conflicts: 0 },
    ...over,
  } as RentalResponseDto
}

function serve(body: RentalResponseDto) {
  server.use(http.get(RENTAL_URL, () => HttpResponse.json(body, { status: 200 })))
}

function recordAddressPuts() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.put(`${RENTAL_URL}/objekte/:objektId/adresse`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(response(), { status: 200 })
    }),
  )
  return bodies
}

function renderRental(props: { onDone?: () => void; onBack?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <RentalScreen taxYear={TAX_YEAR} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('VermietungScreen — load failure', () => {
  it('says that loading failed and loads again on retry', async () => {
    let calls = 0
    server.use(
      http.get(RENTAL_URL, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(response(), { status: 200 })
      }),
    )
    renderRental()

    expect(await screen.findByText('Das hat nicht geklappt.')).toBeTruthy()
    fireEvent.click(screen.getByText('Noch mal versuchen'))

    expect(await screen.findByText('Objekt 1')).toBeTruthy()
    expect(calls).toBe(2)
  })
})

describe('VermietungScreen — an open classification', () => {
  it('offers to answer the catalogue question right here and returns to the mask afterwards', async () => {
    serve(response({ classification: { kind: 'unbekannt' }, properties: [] }))
    renderRental()

    fireEvent.click(await screen.findByTestId('vermietung-frage-beantworten'))

    await waitFor(() => expect(screen.queryByTestId('vermietung-frage-beantworten')).toBeNull())
    expect(screen.queryByTestId('vermietung-weiter')).toBeNull()
  })
})

describe('VermietungScreen — field answers', () => {
  it('sends "unlesbar" for a field the user cannot read', async () => {
    serve(response())
    const bodies: unknown[] = []
    server.use(
      http.put(`${RENTAL_URL}/objekte/:objektId/:feld`, async ({ request, params }) => {
        bodies.push({ feld: params.feld, body: await request.json() })
        return HttpResponse.json(response(), { status: 200 })
      }),
    )
    renderRental()
    await screen.findByText('Objekt 1')

    fireEvent.click(screen.getAllByText('unlesbar')[0]!)

    await waitFor(() => expect(bodies).toEqual([{ feld: 'mieteinnahmen', body: { kind: 'unklar' } }]))
  })

  it('splits the street field into street and house number', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.change(await screen.findByTestId('vermietung-0-adresse'), { target: { value: 'Neue Allee 7b' } })
    await waitFor(() => expect(bodies).toContainEqual({ strasse: 'Neue Allee', hausnummer: '7b' }))
  })

  it('sends a street without a house number as the street alone', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.change(await screen.findByTestId('vermietung-0-adresse'), { target: { value: 'Ringstraße' } })
    await waitFor(() => expect(bodies).toContainEqual({ strasse: 'Ringstraße' }))
  })

  it('saves the Ort, the living area and the unit count; refuses a non-numeric unit count', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.change(await screen.findByTestId('vermietung-0-ort'), { target: { value: 'Bonn' } })
    fireEvent.change(screen.getByTestId('vermietung-0-wohnflaeche'), { target: { value: '90' } })
    fireEvent.change(screen.getByTestId('vermietung-0-einheiten'), { target: { value: 'zwei' } })
    fireEvent.change(screen.getByTestId('vermietung-0-einheiten'), { target: { value: ' 3 ' } })

    await waitFor(() => expect(bodies).toEqual([{ city: 'Bonn' }, { livingArea: '90' }, { einheiten: '3' }]))
  })

  it('records the AfA as changed this year with "Nein"', async () => {
    serve(response({}, { depreciationAsLastYear: true }))
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.click(await screen.findByTestId('vermietung-afa-wie-vorjahr-nein'))
    await waitFor(() => expect(bodies).toEqual([{ depreciationAsLastYear: false }]))
  })

  it('lets the user choose the Ort when a postal code has several places', async () => {
    serve(response({}, { plz: '01445', city: null }))
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.click(await screen.findByTestId('vermietung-0-plz-ort-1'))
    await waitFor(() => expect(bodies).toEqual([{ city: 'Dresden' }]))
  })

  it('asks the owner share in a joint return and sends it as a whole number', async () => {
    serve(response())
    server.use(http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'zusammen', personBUserId: null, invitationCode: null, personB: null }, { status: 200 })))
    const bodies = recordAddressPuts()
    renderRental()
    fireEvent.change(await screen.findByTestId('vermietung-0-anteilA'), { target: { value: '60' } })
    await waitFor(() => expect(bodies).toEqual([{ anteilA: '60' }]))
  })

  it('addresses a second object with its own test ids', async () => {
    const second = { ...PROPERTY, id: 'obj-2', propertyKey: 'obj-2' }
    serve({ ...response(), properties: [PROPERTY, second] } as RentalResponseDto)
    renderRental()
    expect(await screen.findByText('Objekt 2')).toBeTruthy()
    expect(screen.getByTestId('vermietung-1-afa-wie-vorjahr-ja')).toBeTruthy()
    expect(screen.getByTestId('vermietung-1-afa-wie-vorjahr-nein')).toBeTruthy()
  })
})

describe('VermietungScreen — purchase date and repairs', () => {
  it('clears the stored day of purchase when the field is emptied', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    const input = await screen.findByTestId('vermietung-0-anschaffungsdatum')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() => expect(bodies).toEqual([{ anschaffungsdatum: null }]))
  })

  it('sends nothing for an unchanged or half-typed date', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    const input = await screen.findByTestId('vermietung-0-anschaffungsdatum')
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '01.0' } })
    fireEvent.blur(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 50))
    expect(bodies).toEqual([])
  })

  it('does not clear an object that never had a day of purchase', async () => {
    serve(response({}, { anschaffungsdatum: null }))
    const bodies = recordAddressPuts()
    renderRental()
    const input = await screen.findByTestId('vermietung-0-anschaffungsdatum')
    fireEvent.blur(input)
    await new Promise((r) => setTimeout(r, 50))
    expect(bodies).toEqual([])
  })

  it('sends a repair when the amount is confirmed with Enter and when its date field loses focus', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    const amount = await screen.findByTestId('vermietung-0-erhaltung-0-betrag')
    fireEvent.change(amount, { target: { value: '900' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    await waitFor(() => expect(bodies).toEqual([{ erhaltungsaufwand: [{ betrag: 900, datum: '2026-02-01' }] }]))

    const date = screen.getByTestId('vermietung-0-erhaltung-0-datum')
    fireEvent.change(date, { target: { value: '01.02.202' } })
    fireEvent.blur(date)
    fireEvent.keyDown(date, { key: 'Enter' })
    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2))
  })

  it('keeps a repair row without an amount out of the list that is sent', async () => {
    serve(response())
    const bodies = recordAddressPuts()
    renderRental()
    await screen.findByTestId('vermietung-0-erhaltung-0-betrag')
    fireEvent.click(screen.getByTestId('vermietung-0-erhaltung-hinzufuegen'))
    const fresh = await screen.findByTestId('vermietung-0-erhaltung-1-betrag')
    fireEvent.blur(fresh)
    await new Promise((r) => setTimeout(r, 50))
    expect(bodies).toEqual([])
  })
})

describe('VermietungScreen — facts, status and navigation', () => {
  it('names the open items of an object and shows the open status with its gate', async () => {
    serve(
      response(
        { status: { kind: 'offen', einnahmen: 100, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 5, depreciation: 7, openItems: 2, conflicts: 0, gated: ['Vermietung'] } },
        { facts: { einnahmen: 100, werbungskosten: null, depreciation: null, openItems: 2 } },
      ),
    )
    renderRental()

    expect(await screen.findByText('Noch offen: 2 Angabe(n) fehlen.')).toBeTruthy()
    expect(screen.getByText('Noch offen: 2 Angabe(n) — die Summen zeigen nur das Erfasste.')).toBeTruthy()
    expect(screen.getByText('Ehrlich: Verkauf oder möbliert rechnen wir in 1.0 noch nicht.')).toBeTruthy()
  })

  it('says "nothing captured yet" for an empty object and hides the gate note when the Vermietung is not gated', async () => {
    serve(response({ status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 3, conflicts: 0, gated: ['Rente'] } }))
    renderRental()
    expect(await screen.findByText('Noch nichts erfasst — trag die Felder ein.')).toBeTruthy()
    expect(screen.queryByText('Ehrlich: Verkauf oder möbliert rechnen wir in 1.0 noch nicht.')).toBeNull()
  })

  it('goes back and on once nothing is pending', async () => {
    serve(response())
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderRental({ onBack, onDone })
    fireEvent.click(await screen.findByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('vermietung-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})
