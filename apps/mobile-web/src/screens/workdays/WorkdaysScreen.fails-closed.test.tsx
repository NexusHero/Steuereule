// WEB-3 (Blocker): a failed load of the commute showed an empty Mo–Fr form whose „Weiter“ PUT the blanks over the
// stored commute. With every request answering 500 the mask shows the failure and sends nothing.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { WorkdaysScreen } from './WorkdaysScreen'
import { renderWithQuery } from '../../test-render'

function renderWorkdays(props: { partnerName?: string; onDone?: () => void } = {}) {
  return renderWithQuery(<WorkdaysScreen taxYear={2026} {...props} />)
}

describe('Arbeitstage fails closed (WEB-3)', () => {
  it('shows the load failure, not an empty form, and writes nothing', async () => {
    const failing = failEveryRequest()
    renderWorkdays()
    expect(await screen.findByTestId('fehler-zustand')).toBeTruthy()
    expect(screen.queryByTestId('arbeitstage-weiter')).toBeNull()
    await expectFailsClosed(failing)
  })

  it('does the same for the partner’s commute', async () => {
    const failing = failEveryRequest()
    renderWorkdays({ partnerName: 'Büsra' })
    await expectFailsClosed(failing)
  })

  it('names an amount it cannot read and does not save it (WEB-12)', async () => {
    const puts: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/2026/arbeitsweg', async ({ request }) => {
        puts.push(await request.json())
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    const onDone = vi.fn()
    renderWorkdays({ onDone })
    const tools = await screen.findByTestId('werbungskosten-arbeitsmittel')
    fireEvent.change(tools, { target: { value: '12x' } })
    fireEvent.blur(tools)
    expect(await screen.findByText(/Das ist kein Betrag/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(puts).toEqual([])
    expect(onDone).not.toHaveBeenCalled()

    // A German amount with thousands and cents is read as such (WEB-46), not as its digits.
    fireEvent.change(tools, { target: { value: '1.234,50' } })
    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(puts.at(-1)).toMatchObject({ workEquipmentEur: 1235 })
  })
})
