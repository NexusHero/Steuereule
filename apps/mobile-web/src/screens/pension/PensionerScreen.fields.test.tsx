// The Rentner mask beyond the first happy path: the error state with a retry, every field the
// Rentenart reveals (record + "unlesbar"), the save-failure notice, and a pension recorded for the partner.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { PensionResponseDto } from '@steuereule/api-client'
import { PensionerScreen } from './PensionerScreen'
import { server } from '../../../test/test-msw-server'
import { renderWithQuery } from '../../../test/test-render'

const PENSION_URL = '*/v1/steuerjahre/2026/rente'

function pension(over: Partial<PensionResponseDto>): PensionResponseDto {
  return {
    kind: null,
    jahresbetrag: { kind: 'offen' },
    rentenbeginnJahr: { kind: 'offen' },
    alterBeiRentenbeginn: { kind: 'offen' },
    items: [],
    status: { kind: 'bestimmt', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0 },
    ...over,
  } as PensionResponseDto
}

function renderPension(props: { partnerName?: string; onDone?: () => void } = {}) {
  return renderWithQuery(<PensionerScreen taxYear={2026} {...props} />)
}

function captureBodies(path: string, reply: PensionResponseDto) {
  const calls: { url: string; body: unknown }[] = []
  server.use(
    http.put(`${PENSION_URL}/${path}`, async ({ request }) => {
      calls.push({ url: request.url, body: await request.json() })
      return HttpResponse.json(reply, { status: 200 })
    }),
  )
  return calls
}

describe('PensionerScreen states', () => {
  it('says honestly that the pension could not be loaded and loads again on retry', async () => {
    let healthy = false
    server.use(http.get(PENSION_URL, () => (healthy ? HttpResponse.json(pension({}), { status: 200 }) : HttpResponse.json(null, { status: 500 }))))
    renderPension()

    expect(await screen.findByText('Das konnte nicht geladen werden.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))

    expect(await screen.findByText('Welche Rente beziehst du?')).toBeTruthy()
    expect(screen.queryByText('Das konnte nicht geladen werden.')).toBeNull()
  })

  it('shows the loading state first', () => {
    renderPension()
    expect(screen.getByLabelText('Deine Rente wird geladen …')).toBeTruthy()
  })

  it('lets the user continue without a handler wired (Weiter does not crash)', async () => {
    renderPension()
    await screen.findByText('Welche Rente beziehst du?')
    expect(() => fireEvent.click(screen.getByText('Weiter'))).not.toThrow()
  })
})

describe('PensionerScreen fields', () => {
  it('asks for the pension start year for a statutory pension and records it on blur', async () => {
    server.use(http.get(PENSION_URL, () => HttpResponse.json(pension({ kind: 'GesetzlicheRente' }), { status: 200 })))
    const calls = captureBodies('rentenbeginnJahr', pension({ kind: 'GesetzlicheRente' }))
    renderPension()
    const input = await screen.findByLabelText('Jahr des Rentenbeginns (Ganzzahliger Wert)')
    expect(screen.queryByLabelText('Alter bei Rentenbeginn (Ganzzahliger Wert)')).toBeNull()

    fireEvent.change(input, { target: { value: '2019' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'erfasst', value: 2019 }))
  })

  it('marks the start year as unreadable', async () => {
    server.use(http.get(PENSION_URL, () => HttpResponse.json(pension({ kind: 'Betriebsrente' }), { status: 200 })))
    const calls = captureBodies('rentenbeginnJahr', pension({ kind: 'Betriebsrente' }))
    renderPension()
    await screen.findByText('Jahr des Rentenbeginns')

    fireEvent.click(screen.getAllByText('Kann ich nicht lesen')[1]!)

    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'unklar' }))
  })

  it('asks for the age at pension start instead for a private annuity', async () => {
    server.use(http.get(PENSION_URL, () => HttpResponse.json(pension({ kind: 'PrivateRentenversicherung' }), { status: 200 })))
    const calls = captureBodies('alterBeiRentenbeginn', pension({ kind: 'PrivateRentenversicherung' }))
    renderPension()
    const input = await screen.findByLabelText('Alter bei Rentenbeginn (Ganzzahliger Wert)')
    expect(screen.queryByLabelText('Jahr des Rentenbeginns (Ganzzahliger Wert)')).toBeNull()

    fireEvent.change(input, { target: { value: '63' } })
    fireEvent.blur(input)
    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'erfasst', value: 63 }))

    fireEvent.click(screen.getAllByText('Kann ich nicht lesen')[1]!)
    await waitFor(() => expect(calls[1]?.body).toEqual({ kind: 'unklar' }))
  })

  it('records the Jahresbetrag as a whole number', async () => {
    const calls = captureBodies('jahresbetrag', pension({}))
    renderPension()
    const input = await screen.findByLabelText('Jahresbetrag der Rente (Ganzzahliger Wert)')

    fireEvent.change(input, { target: { value: '18000' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'erfasst', value: 18000 }))
  })

  it('does not send anything for text that is no whole number', async () => {
    const calls = captureBodies('jahresbetrag', pension({}))
    renderPension()
    const input = await screen.findByLabelText('Jahresbetrag der Rente (Ganzzahliger Wert)')

    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    await new Promise((r) => setTimeout(r, 30))

    expect(calls).toHaveLength(0)
  })

  it('keeps the user on the mask once after a failed save and leaves on the second press', async () => {
    server.use(http.put(`${PENSION_URL}/art`, () => HttpResponse.json({ message: 'no' }, { status: 500 })))
    const onDone = vi.fn()
    renderPension({ onDone })
    await screen.findByText('Welche Rente beziehst du?')

    fireEvent.click(screen.getByText('Gesetzliche Rente'))
    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(screen.getByTestId('speichern-fehlgeschlagen')).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('records the pension of the partner (Person B) and says whose it is', async () => {
    const urls: string[] = []
    server.use(
      http.get(PENSION_URL, ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json(pension({}), { status: 200 })
      }),
    )
    renderPension({ partnerName: 'Sam' })

    expect(await screen.findByText('Rente von Sam.')).toBeTruthy()
    expect(urls[0]).toContain('person=B')
  })
})
