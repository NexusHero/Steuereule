// Household children — the remaining actions: toggling the offered children, "ja" to a duplicate
// question, leaving the household, cancelling a deletion, the over-25 hint and the failure notice.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { HouseholdPersonDto, HouseholdResponseDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { HouseholdChildrenSection } from './HouseholdChildrenSection'
import { confirmAction } from '../../../test/test-confirm'
import { renderWithQuery } from '../../../test/test-render'

const person = (over: Partial<HouseholdPersonDto>): HouseholdPersonDto => ({
  personId: 'p1',
  kind: 'child',
  firstName: 'Mila',
  lastName: 'Richter',
  birthDate: '2019-05-12',
  childId: null,
  inThisYear: false,
  fromYear: 2025,
  preselected: true,
  selectable: true,
  asksForEducation: false,
  leftFromYear: null,
  updatedBySelf: true,
  updatedAt: '2026-01-05T10:00:00.000Z',
  ...over,
})

const household = (persons: HouseholdPersonDto[], candidates: HouseholdResponseDto['candidates'] = []): HouseholdResponseDto => ({
  householdUserId: 'user',
  persons,
  candidates,
  partnerLink: null,
})

function renderSection(onChanged = vi.fn(async () => {})) {
  renderWithQuery(<HouseholdChildrenSection taxYear={2026} onChanged={onChanged} />)
  return { onChanged }
}

const serveHousehold = (body: HouseholdResponseDto) => server.use(http.get('*/v1/steuerjahre/2026/haushalt', () => HttpResponse.json(body)))

describe('HouseholdChildrenSection — actions', () => {
  it('lets the user untick and tick a child, names the over-25 hint, and disables taking over nothing', async () => {
    serveHousehold(household([person({}), person({ personId: 'p2', firstName: 'Jonas', birthDate: '1999-03-01', preselected: false })]))
    renderSection()
    const mila = await screen.findByTestId('haushalt-kind-0')
    await waitFor(() => expect(mila.getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByTestId('haushalt-kind-1').textContent).toContain('aus 2025')

    fireEvent.click(mila)
    await waitFor(() => expect(mila.getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByTestId('haushalt-uebernehmen').getAttribute('aria-disabled') ?? screen.getByTestId('haushalt-uebernehmen').hasAttribute('disabled')).toBeTruthy()

    fireEvent.click(screen.getByTestId('haushalt-kind-1').querySelector('[role="button"]') ?? screen.getByTestId('haushalt-kind-1'))
    await waitFor(() => expect(screen.getByTestId('haushalt-kind-1').getAttribute('aria-checked')).toBe('true'))
  })

  it('confirms a duplicate with "ja"', async () => {
    let answered: unknown = null
    serveHousehold(
      household([], [{ id: 'c1', a: { personId: 'p1', name: 'Mila Richter', birthDate: '2019-05-12' }, b: { personId: 'p2', name: 'Milla Richter', birthDate: '2019-05-12' } }]),
    )
    server.use(
      http.post('*/v1/steuerjahre/2026/haushalt/dubletten/c1', async ({ request }) => {
        answered = await request.json()
        return HttpResponse.json(household([]))
      }),
    )
    const { onChanged } = renderSection()
    await act(async () => {
      fireEvent.click(await screen.findByTestId('haushalt-dublette-ja'))
    })
    await waitFor(() => expect(answered).toEqual({ same: true }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('takes a child out of this year and keeps the cancel path of the deletion warning', async () => {
    let left = 0
    serveHousehold(household([person({ inThisYear: true, childId: 'k1', asksForEducation: true })]))
    server.use(
      http.post('*/v1/steuerjahre/2026/haushalt/personen/p1/nicht-mehr-dabei', () => {
        left += 1
        return HttpResponse.json(household([]))
      }),
      http.delete('*/v1/steuerjahre/2026/haushalt/personen/p1', () => HttpResponse.json(household([]))),
    )
    renderSection()
    await screen.findByTestId('haushalt-dabei-0')
    expect(screen.queryByTestId('haushalt-geaendert-0')).toBeNull()

    fireEvent.click(screen.getByTestId('haushalt-loeschen-0'))
    expect(screen.getByTestId('rueckfrage-householdDelete')).toBeTruthy()
    fireEvent.click(screen.getByTestId('rueckfrage-householdDelete-cancel'))
    expect(screen.queryByTestId('rueckfrage-householdDelete')).toBeNull()

    fireEvent.click(screen.getByTestId('haushalt-nicht-mehr-dabei-0'))
    // NM-03: leaving deletes the child's details from this year on; it asks first.
    expect(screen.getByTestId('rueckfrage-householdLeave-body').textContent).toContain('ab 2026')
    expect(left).toBe(0)
    await act(async () => {
      confirmAction('householdLeave')
    })
    await waitFor(() => expect(left).toBe(1))
  })

  it('says so when a household action fails, and does not report a change', async () => {
    serveHousehold(household([person({ inThisYear: true, childId: 'k1' })]))
    server.use(http.delete('*/v1/steuerjahre/2026/haushalt/personen/p1', () => HttpResponse.json({ message: 'no' }, { status: 500 })))
    const { onChanged } = renderSection()
    fireEvent.click(await screen.findByTestId('haushalt-loeschen-0'))
    await act(async () => {
      confirmAction('householdDelete')
    })
    expect(await screen.findByTestId('haushalt-fehler')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
  })
})
