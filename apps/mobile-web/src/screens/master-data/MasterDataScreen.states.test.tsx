// The Stammdaten mask's failure paths and the partner section's writes: a failed load that can be
// retried, a lost connection while saving, choosing the Veranlagungsart, saving Person B and a code
// that cannot be redeemed because the network is down.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { LinkResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { MasterDataScreen } from './MasterDataScreen'
import { confirmAction } from '../../../test/test-confirm'
import { renderWithQuery } from '../../../test/test-render'

const LEER: MasterDataResponseDto = {
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

function renderScreen() {
  renderWithQuery(<MasterDataScreen onBack={() => {}} taxYear={2025} />)
}

beforeEach(() => {
  server.use(
    http.get('*/v1/arbeitgeber', () => HttpResponse.json([])),
    http.get('*/v1/steuerjahre/:jahr/haushalt', () => HttpResponse.json({ householdUserId: 'u', persons: [], candidates: [], partnerLink: null })),
  )
})
afterEach(() => server.resetHandlers())

describe('StammdatenScreen failures', () => {
  it('says the details could not be loaded and loads them again on retry', async () => {
    let healthy = false
    server.use(http.get('*/v1/stammdaten', () => (healthy ? HttpResponse.json(LEER) : HttpResponse.json(null, { status: 500 }))))
    renderScreen()
    expect(await screen.findByText('Das konnte nicht geladen werden.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('Alles da für den Ausdruck.')).toBeTruthy()
  })

  it('says the connection is the problem when saving fails on the network', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)), http.put('*/v1/stammdaten', () => HttpResponse.error()))
    renderScreen()
    fireEvent.change(await screen.findByTestId('stammdaten-beruf'), { target: { value: 'Lehrerin' } })
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    expect(await screen.findByText('Speichern hat nicht geklappt. Prüf die Verbindung.')).toBeTruthy()
  })
})

describe('the partner section', () => {
  const NO_LINK: LinkResponseDto = { filingType: 'keine' } as LinkResponseDto
  const JOINT: LinkResponseDto = {
    filingType: 'zusammen',
    personBUserId: 'b',
    personBHasOwnAccount: false,
    personB: { firstName: 'Bea', lastName: 'Muster', steuerId: null, geburtsdatum: null, religion: null, beruf: null },
  } as LinkResponseDto

  it('chooses the Veranlagungsart for the tax year the mask is opened for', async () => {
    const kinds: unknown[] = []
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      // The stored link answers the reload after each choice, as the API does.
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(kinds.length === 0 ? NO_LINK : JOINT)),
      http.put('*/v1/steuerjahre/2025/kopplung', async ({ request }) => {
        kinds.push(await request.json())
        return HttpResponse.json(JOINT)
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('kopplung-zusammen'))
    await waitFor(() => expect(kinds).toEqual([{ filingType: 'zusammen' }]))
    // Leaving the joint assessment asks first; the question exists once the mask shows the joint year.
    await screen.findByTestId('personb-vorname')
    fireEvent.click(screen.getByTestId('kopplung-einzel'))
    confirmAction('singleAssessment')
    await waitFor(() => expect(kinds[1]).toEqual({ filingType: 'einzel' }))
  })

  it('saves what was typed about Person B', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      http.put('*/v1/steuerjahre/2025/kopplung/person-b', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(JOINT)
      }),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('personb-beruf'), { target: { value: 'Ärztin' } })
    fireEvent.change(screen.getByTestId('personb-geburtsdatum'), { target: { value: '12.04.1990' } })
    fireEvent.click(screen.getByTestId('personb-speichern'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ beruf: 'Ärztin', geburtsdatum: '1990-04-12' })
  })

  it('says the connection is the problem when the invite code cannot be redeemed', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(NO_LINK)),
      http.post('*/v1/steuerjahre/:jahr/kopplung/beitreten/:code', () => HttpResponse.error()),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('kopplung-code'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByTestId('kopplung-beitreten'))
    expect(await screen.findByText('Das hat nicht geklappt. Prüf die Verbindung und versuch es noch einmal.')).toBeTruthy()
  })

  it('does nothing for an empty invite code', async () => {
    let posted = false
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(NO_LINK)),
      http.post('*/v1/steuerjahre/:jahr/kopplung/beitreten/:code', () => ((posted = true), HttpResponse.json({}))),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('kopplung-beitreten'))
    await new Promise((r) => setTimeout(r, 30))
    expect(posted).toBe(false)
  })
})
