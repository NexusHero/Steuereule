// Vermietung after WEB-28: a failed load writes nothing; address and number fields hold what is typed and save
// when left (WEB-39 / NM-04); „Objekt hinzufügen“ creates one property per tap (NM-13); a link that does not
// load says why the share question is missing (NM-15).
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { delay, http, HttpResponse } from 'msw'
import type { RentalPropertyDto, RentalResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { RentalScreen } from './RentalScreen'

const RENTAL_URL = '*/v1/steuerjahre/2026/vermietung'

const PROPERTY: RentalPropertyDto = {
  id: 'obj-1',
  mieteinnahmen: { kind: 'offen' },
  anschaffungskosten: { kind: 'offen' },
  baujahr: { kind: 'offen' },
  werbungskosten: { kind: 'offen' },
  strasse: null,
  hausnummer: null,
  plz: null,
  city: null,
  livingArea: null,
  depreciationAsLastYear: null,
  umlagen: '2400',
  schuldzinsen: null,
  einheiten: null,
  anteilA: null,
  propertyKey: 'obj-1',
  anschaffungsdatum: null,
  erhaltungsaufwand: [],
  facts: { einnahmen: null, werbungskosten: null, depreciation: null, openItems: 3 },
} as RentalPropertyDto

const RESPONSE: RentalResponseDto = {
  classification: { kind: 'einfach' },
  properties: [PROPERTY],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 3, conflicts: 0 },
} as RentalResponseDto

function renderRental() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <RentalScreen taxYear={2026} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function recordAddressPuts() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.get(RENTAL_URL, () => HttpResponse.json(RESPONSE)),
    http.put(`${RENTAL_URL}/objekte/:objektId/adresse`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(RESPONSE)
    }),
  )
  return bodies
}

describe('Vermietung fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderRental()
    await expectFailsClosed(failing)
  })

  it('says the share question is missing when the link does not load (NM-15)', async () => {
    server.use(
      http.get(RENTAL_URL, () => HttpResponse.json(RESPONSE)),
      http.get('*/v1/steuerjahre/2026/kopplung', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderRental()
    expect(await screen.findByTestId('vermietung-anteil-ladefehler')).toBeTruthy()
  })
})

describe('Vermietung address and number fields (WEB-39)', () => {
  it('keeps every typed character, spaces included, and saves once when the field is left', async () => {
    const bodies = recordAddressPuts()
    renderRental()
    const street = (await screen.findByTestId('vermietung-0-adresse')) as HTMLInputElement
    for (const value of ['A', 'Am', 'Am ', 'Am M', 'Am Markt', 'Am Markt ', 'Am Markt 5']) fireEvent.change(street, { target: { value } })
    expect(street.value).toBe('Am Markt 5')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(bodies).toEqual([])
    fireEvent.blur(street)
    await waitFor(() => expect(bodies).toEqual([{ strasse: 'Am Markt', hausnummer: '5' }]))
    expect(street.value).toBe('Am Markt 5')
  })

  it('names an emptied amount instead of silently showing the old one again', async () => {
    const bodies = recordAddressPuts()
    renderRental()
    const allocations = (await screen.findByTestId('vermietung-0-umlagen')) as HTMLInputElement
    expect(allocations.value).toBe('2400')
    fireEvent.change(allocations, { target: { value: '' } })
    fireEvent.blur(allocations)
    expect(await screen.findByText(/Trag 0 ein/)).toBeTruthy()
    expect(allocations.value).toBe('')
    expect(bodies).toEqual([])
  })
})

describe('Objekt hinzufügen (NM-13)', () => {
  it('a double tap creates one property', async () => {
    let created = 0
    server.use(
      http.get(RENTAL_URL, () => HttpResponse.json(RESPONSE)),
      http.post(`${RENTAL_URL}/objekte`, async () => {
        created += 1
        await delay(30)
        return HttpResponse.json(RESPONSE)
      }),
    )
    renderRental()
    const add = await screen.findByTestId('objekt-hinzufuegen')
    fireEvent.click(add)
    fireEvent.click(add)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(created).toBe(1)
  })
})
