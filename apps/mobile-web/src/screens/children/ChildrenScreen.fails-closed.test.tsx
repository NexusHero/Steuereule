// Kinder after WEB-28: a failed load writes nothing; taking over last year's children shows them in the mask's
// list at once (WEB-42 / NM-08); a failed marital-status read does not ask a married user the single-parent
// questions (NM-15); a failed save names its reason (NM-07); „Weiter“ with a typed or changed child asks once, an
// opened but unchanged one leaves at once (NM-10).
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { HouseholdResponseDto } from '@steuereule/api-client'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { ChildrenScreen } from './ChildrenScreen'
import { renderWithQuery } from '../../test-render'

const LINA = { id: 'kind-1', sequenceNumber: 1, firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2016-05-12' }
const list = (kinder: unknown[]) => ({ kinder, count: kinder.length, childBenefitSum: 0, totalAllowance: 0, swissFamilyAllowanceSum: 0, differentialChildBenefitSum: 0 })

const OFFERED: HouseholdResponseDto = {
  householdUserId: 'u',
  persons: [
    {
      personId: 'p1',
      kind: 'child',
      firstName: 'Lina',
      lastName: 'Muster',
      birthDate: '2016-05-12',
      childId: null,
      inThisYear: false,
      fromYear: 2025,
      preselected: true,
      selectable: true,
      asksForEducation: false,
      leftFromYear: null,
      updatedBySelf: true,
      updatedAt: '2026-01-05T10:00:00.000Z',
    },
  ],
  candidates: [],
  partnerLink: null,
} as HouseholdResponseDto

function renderChildren(onDone: () => void = () => {}) {
  return renderWithQuery(<ChildrenScreen taxYear={2026} onDone={onDone} />)
}

describe('Kinder fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderChildren()
    await expectFailsClosed(failing)
  })
})

describe('Kinder secondary reads and writes', () => {
  it('lists the children taken over from last year at once (WEB-42)', async () => {
    let adopted = false
    server.use(
      http.get('*/v1/steuerjahre/2026/kinder', () => HttpResponse.json(list(adopted ? [LINA] : []))),
      http.get('*/v1/steuerjahre/2026/haushalt', () => HttpResponse.json(OFFERED)),
      http.post('*/v1/steuerjahre/2026/haushalt/kinder/uebernehmen', () => {
        adopted = true
        return HttpResponse.json(OFFERED)
      }),
    )
    renderChildren()
    const takeOver = await screen.findByTestId('haushalt-uebernehmen')
    await waitFor(() => expect(takeOver.getAttribute('aria-disabled')).not.toBe('true'))
    expect(screen.queryByLabelText('Kind Lina bearbeiten')).toBeNull()
    fireEvent.click(takeOver)
    expect(await screen.findByLabelText('Kind Lina bearbeiten')).toBeTruthy()
  })

  it('keeps the single-parent questions hidden and says why when the marital status does not load (NM-15)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/kinder', () => HttpResponse.json(list([LINA]))),
      http.get('*/v1/stammdaten', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderChildren()
    expect(await screen.findByTestId('kinder-familienstand-ladefehler')).toBeTruthy()
    expect(screen.queryByText('Fragen zum Entlastungsbetrag beantworten')).toBeNull()
  })

  it('names why a child was not saved, and asks once before Weiter drops it (NM-07, NM-10)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/kinder', () => HttpResponse.json(list([]))),
      http.post('*/v1/steuerjahre/2026/kinder', () => HttpResponse.json({ message: 'slow' }, { status: 429 })),
    )
    const onDone = vi.fn()
    renderChildren(onDone)
    fireEvent.change(await screen.findByLabelText('Vorname'), { target: { value: 'Mia' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Muster' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '12.05.2018' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    expect((await screen.findByTestId('kind-speichern-fehler')).textContent).toContain('zu viele Anfragen')

    fireEvent.click(screen.getByTestId('kinder-weiter'))
    expect(await screen.findByTestId('kinder-formular-offen')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('leaves at once when a stored child was only opened, and asks once when it was changed (NM-10)', async () => {
    server.use(http.get('*/v1/steuerjahre/2026/kinder', () => HttpResponse.json(list([LINA]))))
    const onDone = vi.fn()
    renderChildren(onDone)
    fireEvent.click(await screen.findByLabelText('Kind Lina bearbeiten'))
    expect(((await screen.findByLabelText('Vorname')) as HTMLInputElement).value).toBe('Lina')
    fireEvent.click(screen.getByTestId('kinder-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('kinder-formular-offen')).toBeNull()

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Linda' } })
    fireEvent.click(screen.getByTestId('kinder-weiter'))
    expect(await screen.findByTestId('kinder-formular-offen')).toBeTruthy()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
