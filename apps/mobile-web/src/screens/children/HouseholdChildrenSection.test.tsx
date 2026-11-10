import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { HouseholdPersonDto, HouseholdResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { HouseholdChildrenSection } from './HouseholdChildrenSection'

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <HouseholdChildrenSection taxYear={2026} onChanged={onChanged} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onChanged }
}

describe('HouseholdChildrenSection (#452 slice 3)', () => {
  it('offers last year’s children preselected and marked „aus 2025“, and takes them over on one click', async () => {
    let body: unknown = null
    server.use(
      http.get('*/v1/steuerjahre/2026/haushalt', () =>
        HttpResponse.json(household([person({}), person({ personId: 'p2', firstName: 'Jonas', birthDate: '1999-03-01', preselected: false })])),
      ),
      http.post('*/v1/steuerjahre/2026/haushalt/kinder/uebernehmen', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(household([person({ inThisYear: true, childId: 'k1' })]))
      }),
    )
    const { onChanged } = renderSection()
    const mila = await screen.findByTestId('haushalt-kind-0')
    expect(mila.textContent).toContain('aus 2025')
    await waitFor(() => expect(mila.getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByTestId('haushalt-kind-1').getAttribute('aria-checked')).toBe('false')
    await act(async () => {
      fireEvent.click(screen.getByTestId('haushalt-uebernehmen'))
    })
    await waitFor(() => expect(body).toEqual({ personIds: ['p1'] }))
    expect(onChanged).toHaveBeenCalled()
  })

  it('asks „Sind das dieselben?“ once and sends the answer', async () => {
    let answered: unknown = null
    server.use(
      http.get('*/v1/steuerjahre/2026/haushalt', () =>
        HttpResponse.json(
          household([], [{ id: 'c1', a: { personId: 'p1', name: 'Mila Richter', birthDate: '2019-05-12' }, b: { personId: 'p2', name: 'Milla Richter', birthDate: '2019-05-12' } }]),
        ),
      ),
      http.post('*/v1/steuerjahre/2026/haushalt/dubletten/c1', async ({ request }) => {
        answered = await request.json()
        return HttpResponse.json(household([]))
      }),
    )
    renderSection()
    expect((await screen.findByTestId('haushalt-dublette')).textContent).toContain('Milla Richter')
    await act(async () => {
      fireEvent.click(screen.getByTestId('haushalt-dublette-nein'))
    })
    await waitFor(() => expect(answered).toEqual({ same: false }))
  })

  it('warns before deleting for good and only deletes after the confirmation', async () => {
    let deletes = 0
    server.use(
      http.get('*/v1/steuerjahre/2026/haushalt', () => HttpResponse.json(household([person({ inThisYear: true, childId: 'k1', updatedBySelf: false })]))),
      http.delete('*/v1/steuerjahre/2026/haushalt/personen/p1', () => {
        deletes += 1
        return HttpResponse.json(household([]))
      }),
    )
    renderSection()
    expect((await screen.findByTestId('haushalt-geaendert-0')).textContent).toContain('geändert von deinem Partner')
    fireEvent.click(screen.getByTestId('haushalt-loeschen-0'))
    expect(screen.getByTestId('haushalt-loeschen-warnung').textContent).toContain('aus allen Steuerjahren')
    expect(deletes).toBe(0)
    await act(async () => {
      fireEvent.click(screen.getByTestId('haushalt-loeschen-bestaetigen'))
    })
    await waitFor(() => expect(deletes).toBe(1))
  })

  it('stays out of the way for an empty household', async () => {
    renderSection()
    await act(async () => {})
    expect(screen.queryByTestId('haushalt-kinder')).toBeNull()
  })
})
