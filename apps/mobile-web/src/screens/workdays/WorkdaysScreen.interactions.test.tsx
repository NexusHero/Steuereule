// Arbeitstage mask: the weekday pattern as the user toggles it, the shortest-route confirmation of the
// second way, a failed save that keeps the user here, leaving without handlers, and the partner's mask.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { weekdaysInYear } from '@steuereule/core'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { WorkdaysScreen, type WorkdaysScreenProps } from './WorkdaysScreen'
import { renderWithQuery } from '../../test-render'

function renderWorkdays(props: WorkdaysScreenProps = {}) {
  return renderWithQuery(<WorkdaysScreen taxYear={2026} {...props} />)
}

function recordPuts(status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  server.use(
    http.put('*/v1/steuerjahre/2026/arbeitsweg', async ({ request }) => {
      calls.push({ url: request.url, body: (await request.json()) as Record<string, unknown> })
      return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null }, { status })
    }),
  )
  return calls
}

describe('the weekday pattern', () => {
  it('recounts the weekdays when a working day is switched off and on again', async () => {
    renderWorkdays()
    await screen.findByText('Wochentage im Jahr')
    const monToFri = weekdaysInYear(2026, [1, 2, 3, 4, 5])
    const monToThu = weekdaysInYear(2026, [1, 2, 3, 4])
    expect(screen.getAllByText(String(monToFri)).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Fr'))
    expect(screen.getAllByText(String(monToThu)).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(String(monToFri))).toHaveLength(0)

    fireEvent.click(screen.getByText('Fr'))
    expect(screen.getAllByText(String(monToFri)).length).toBeGreaterThan(0)
  })

  it('shows no result at all while no day is a working day, and a Saturday can be added', async () => {
    renderWorkdays()
    await screen.findByText('Wochentage im Jahr')
    for (const day of ['Mo', 'Di', 'Mi', 'Do', 'Fr']) fireEvent.click(screen.getByText(day))
    expect(screen.queryByText('Wochentage im Jahr')).toBeNull()

    fireEvent.click(screen.getByText('Sa'))
    expect(screen.getByText('Wochentage im Jahr')).toBeTruthy()
    expect(screen.getAllByText(String(weekdaysInYear(2026, [6]))).length).toBeGreaterThan(0)
  })
})

describe('saving', () => {
  it('keeps the user on the mask and says it did not save when the server refuses', async () => {
    recordPuts(500)
    const onDone = vi.fn()
    renderWorkdays({ onDone })
    await screen.findByText('Wochentage im Jahr')

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))

    expect(await screen.findByText(/Nicht gespeichert/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('keeps the user on the mask when the network fails', async () => {
    server.use(http.put('*/v1/steuerjahre/2026/arbeitsweg', () => HttpResponse.error()))
    const onDone = vi.fn()
    renderWorkdays({ onDone })
    await screen.findByText('Wochentage im Jahr')

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))

    expect(await screen.findByText(/Nicht gespeichert/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('leaves with Zurück without saving, and Weiter works when no handler is wired', async () => {
    const calls = recordPuts()
    const onBack = vi.fn()
    renderWorkdays({ onBack })
    await screen.findByText('Wochentage im Jahr')
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(0)

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(calls).toHaveLength(1))
  })

  it('records the shortest-route confirmation of both ways once their distances are given', async () => {
    const calls = recordPuts()
    renderWorkdays()
    await screen.findByText('Wochentage im Jahr')
    fireEvent.change(screen.getByTestId('arbeitstage-km'), { target: { value: '12' } })
    fireEvent.click(screen.getByTestId('arbeitstage-kuerzeste'))
    fireEvent.click(screen.getByTestId('arbeitsweg-wechsel'))
    fireEvent.change(screen.getByTestId('arbeitsweg-bis'), { target: { value: '30.06.2026' } })
    fireEvent.change(screen.getByTestId('arbeitsweg-zweiter-ab'), { target: { value: '01.07.2026' } })
    fireEvent.change(screen.getByTestId('arbeitsweg-zweiter-km'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('arbeitsweg-zweiter-kuerzeste'))

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[calls.length - 1]!.body).toMatchObject({ shortestRouteConfirmed: true, secondShortestRouteConfirmed: true, secondOneWayKm: 30, oneWayKm: 12 })
  })

  it('turns the confirmation off again when the chip is pressed twice', async () => {
    const calls = recordPuts()
    renderWorkdays()
    await screen.findByText('Wochentage im Jahr')
    fireEvent.change(screen.getByTestId('arbeitstage-km'), { target: { value: '12' } })
    fireEvent.click(screen.getByTestId('arbeitstage-kuerzeste'))
    fireEvent.click(screen.getByTestId('arbeitstage-kuerzeste'))

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[calls.length - 1]!.body.shortestRouteConfirmed).toBeNull()
  })
})

describe("the partner's mask", () => {
  it('reads and saves for Person B and does not look up the own address', async () => {
    const urls: string[] = []
    server.use(
      http.get('*/v1/steuerjahre/2026/arbeitsweg', ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    const calls = recordPuts()
    renderWorkdays({ partnerName: 'Büsra' })
    await screen.findByText('Arbeitstage und Arbeitsweg von Büsra')
    expect(urls[0]).toContain('person=B')

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.url).toContain('person=B')
  })
})
