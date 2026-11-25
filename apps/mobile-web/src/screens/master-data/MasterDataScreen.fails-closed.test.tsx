// The Stammdaten mask's failure paths after WEB-28: a failed load shows the failure and writes nothing; the
// partner section never offers a choice it could not load (WEB-36 / NM-02); „Partner-Angaben übernehmen“ sends
// only what the user changed, so Person B's Steuer-ID and confession survive a direct open (WEB-29 / NM-01).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { delay, http, HttpResponse } from 'msw'
import type { LinkResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { MasterDataScreen } from './MasterDataScreen'
import { confirmAction } from '../../confirm/confirmInTest'

const MARRIED: MasterDataResponseDto = {
  geburtsdatum: null,
  strasse: null,
  hausnummer: null,
  hausnummerZusatz: null,
  plz: null,
  wohnort: null,
  beruf: null,
  religion: null,
  familienstand: 'verheiratet',
  familienstandSeit: null,
  iban: null,
  kontoinhaber: null,
  finanzamt: null,
  telefon: null,
  missing: [],
} as MasterDataResponseDto

const JOINT: LinkResponseDto = {
  filingType: 'zusammen',
  personBUserId: 'b',
  personBHasOwnAccount: false,
  personB: { firstName: 'Bea', lastName: 'Muster', steuerId: '86095742719', geburtsdatum: '1990-04-12', religion: 'RK', beruf: 'Lehrerin' },
} as LinkResponseDto

function renderScreen(onBack: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MasterDataScreen onBack={onBack} taxYear={2025} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get('*/v1/arbeitgeber', () => HttpResponse.json([])),
    http.get('*/v1/steuerjahre/:jahr/haushalt', () => HttpResponse.json({ householdUserId: 'u', persons: [], candidates: [], partnerLink: null })),
  )
})
afterEach(() => server.resetHandlers())

describe('Stammdaten fail closed', () => {
  it('shows the load failure and writes nothing when every request fails', async () => {
    const failing = failEveryRequest()
    renderScreen()
    await expectFailsClosed(failing)
  })

  it('offers no Veranlagungsart and no code field when the partner link does not load (WEB-36)', async () => {
    const failing = failEveryRequest()
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)))
    renderScreen()
    expect(await screen.findByTestId('kopplung-ladefehler')).toBeTruthy()
    expect(screen.queryByTestId('kopplung-zusammen')).toBeNull()
    expect(screen.queryByTestId('kopplung-code')).toBeNull()
    expect(screen.queryByTestId('personb-speichern')).toBeNull()
    // Only the partner section is affected: the own fields stay; the test presses everything but saves nothing.
    const writes = failing.writes()
    expect(writes).toEqual([])
  })
})

describe('Person B (WEB-29 / NM-01)', () => {
  it('opened directly, changing only the occupation sends only the occupation — Steuer-ID and confession stay', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      // The link answers after the master data, as on a reload: the fields must start from it anyway.
      http.get('*/v1/steuerjahre/:jahr/kopplung', async () => {
        await delay(30)
        return HttpResponse.json(JOINT)
      }),
      http.put('*/v1/steuerjahre/2025/kopplung/person-b', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(JOINT)
      }),
    )
    renderScreen()
    const occupation = await screen.findByTestId('personb-beruf')
    expect((screen.getByTestId('personb-steuerid') as HTMLInputElement).value).toBe('86095742719')
    fireEvent.change(occupation, { target: { value: 'Ärztin' } })
    fireEvent.click(screen.getByTestId('personb-speichern'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ beruf: 'Ärztin' })
    expect(await screen.findByText('Partner-Angaben übernommen.')).toBeTruthy()
  })

  it('clears a field only when the user emptied it', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      http.put('*/v1/steuerjahre/2025/kopplung/person-b', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(JOINT)
      }),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('personb-steuerid'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('personb-speichern'))
    await waitFor(() => expect(bodies).toEqual([{ steuerId: null }]))
  })

  it('names a failed save in words, and keeps what was typed', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      http.put('*/v1/steuerjahre/2025/kopplung/person-b', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('personb-beruf'), { target: { value: 'Ärztin' } })
    fireEvent.click(screen.getByTestId('personb-speichern'))
    expect((await screen.findByTestId('personb-meldung')).textContent).toContain('Nicht gespeichert.')
    expect((screen.getByTestId('personb-beruf') as HTMLInputElement).value).toBe('Ärztin')
  })
})

describe('Kopplung failures are said, not only felt (NM-02)', () => {
  it('a refused Veranlagungsart names the reason', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'keine' })),
      http.put('*/v1/steuerjahre/2025/kopplung', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('kopplung-zusammen'))
    expect((await screen.findByTestId('kopplung-art-fehler')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen')
  })

  it('a code refused for too many tries is not called unknown', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'keine' })),
      http.post('*/v1/steuerjahre/:jahr/kopplung/beitreten/:code', () => HttpResponse.json({ message: 'slow down' }, { status: 429 })),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('kopplung-code'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('kopplung-beitreten'))
    expect(await screen.findByText(/zu viele Anfragen/)).toBeTruthy()
    expect(screen.queryByText(/Diesen Code kennen wir nicht/)).toBeNull()
  })

  it('a failed end of the spouse link is said', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ ...JOINT, personBHasOwnAccount: true })),
      http.get('*/v1/steuerjahre/:jahr/haushalt', () =>
        HttpResponse.json({ householdUserId: 'u', persons: [], candidates: [], partnerLink: { validFromYear: 2024, endedFromYear: null, ownAccount: true } }),
      ),
      http.post('*/v1/steuerjahre/2025/haushalt/partner/nicht-mehr-dabei', () => HttpResponse.error()),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('kopplung-beenden'))
    confirmAction('endPartnerLink')
    expect((await screen.findByTestId('kopplung-beenden-fehler')).textContent).toContain('Keine Verbindung')
  })

  it('a link status that does not load is said, not hidden (NM-15)', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      http.get('*/v1/steuerjahre/:jahr/haushalt', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderScreen()
    expect(await screen.findByTestId('kopplung-status-ladefehler')).toBeTruthy()
  })
})

describe('leaving with unsaved changes (NM-10)', () => {
  it('asks once before Zurück drops what was typed', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ ...MARRIED, familienstand: 'ledig' })))
    const onBack = vi.fn()
    renderScreen(onBack)
    fireEvent.change(await screen.findByTestId('stammdaten-beruf'), { target: { value: 'Lehrerin' } })
    fireEvent.click(screen.getByTestId('stammdaten-zurueck'))
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.getByTestId('stammdaten-ungespeichert')).toBeTruthy()
    fireEvent.click(screen.getByTestId('stammdaten-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
