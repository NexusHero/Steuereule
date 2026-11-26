// Arbeitstage-Assistent-Screen (M4) — calendar logic from the core (no free text): the work-week
// pattern + vacation/sick/home-office days fold through `berechneWerktage` to a weekday/commute-day
// count, and a contradiction (more vacation than work days) is named, never clamped.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { weekdaysInYear } from '@steuereule/core'
import { http, HttpResponse } from 'msw'
import { getCommuteControllerGetQueryKey, getCockpitControllerGetCockpitSummaryQueryKey, getTaxEstimateControllerGetQueryKey } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { WorkdaysScreen } from './WorkdaysScreen'
import { makeTestQueryClient, renderWithQuery } from '../../../test/test-render'

function renderWorkdays(onDone: () => void = () => {}, taxYear = 2026, queryClient = makeTestQueryClient(), onBack?: () => void) {
  return {
    queryClient,
    ...renderWithQuery(<WorkdaysScreen taxYear={taxYear} onDone={onDone} {...(onBack ? { onBack } : {})} />, { client: queryClient }),
  }
}

/** Records every body PUT to the 2025 commute endpoint. */
function recordCommutePuts() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null }, { status: 200 })
    }),
  )
  return bodies
}

describe('ArbeitstageScreen', () => {
  it('counts the default Mo–Fr work week from the real calendar (no free text)', async () => {
    renderWorkdays()

    expect(await screen.findByText('Wochentage im Jahr')).toBeTruthy()
    // 2026 Mo–Fr, before any vacation/sick/home-office subtraction.
    const weekdays = weekdaysInYear(2026, [1, 2, 3, 4, 5])
    expect(screen.getAllByText(String(weekdays)).length).toBeGreaterThan(0)
  })

  it('asks about the partner by name, not „du“ (Echtdatentest 18.11.2026)', async () => {
    renderWithQuery(<WorkdaysScreen taxYear={2026} partnerName="Büsra" />)
    expect(await screen.findByText('An welchen Tagen arbeitet Büsra?')).toBeTruthy()
    expect(screen.queryByText('An welchen Tagen arbeitest du?')).toBeNull()
  })

  it('names a widerspruch when vacation days exceed the work days, never clamps', async () => {
    renderWorkdays()

    // 999 vacation days is far more than the Mo–Fr weekdays in any year.
    fireEvent.change(await screen.findByLabelText('Urlaubstage'), { target: { value: '999' } })
    expect(await screen.findByText('Das passt nicht zusammen.')).toBeTruthy()
  })

  it('subtracts vacation/sick/home-office days from the weekday count', async () => {
    renderWorkdays()

    const vacation = await screen.findByLabelText('Urlaubstage')
    fireEvent.change(vacation, { target: { value: '10' } })
    const sick = screen.getByLabelText('Krankheitstage')
    fireEvent.change(sick, { target: { value: '5' } })

    const weekdays = weekdaysInYear(2026, [1, 2, 3, 4, 5])
    expect(screen.getAllByText(String(weekdays - 15)).length).toBeGreaterThan(0)
  })

  it('shows the facts saved last time instead of starting empty', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () =>
        HttpResponse.json({
          inputs: { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 20, oneWayKm: 30, transport: 'pkw', workplace: 'Lörrach' },
          workdays: { weekdays: 261, workdays: 226, commuteDays: 206 },
          commuterAllowance: 2019,
        }),
      ),
    )
    renderWorkdays(() => {}, 2025)

    expect(((await screen.findByLabelText('Urlaubstage')) as HTMLInputElement).value).toBe('30')
    expect((screen.getByLabelText('Einfache Entfernung in km') as HTMLInputElement).value).toBe('30')
  })

  it('previews the Entfernungspauschale once distance and means of travel are known', async () => {
    renderWorkdays(() => {}, 2025)

    fireEvent.change(await screen.findByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Eigenes Auto'))

    expect(await screen.findByText('1.175 €')).toBeTruthy()
  })

  it('stated travel days replace the derived commute days in the preview and are saved (ADR-0093)', async () => {
    const bodies = recordCommutePuts()
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    fireEvent.change(await screen.findByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Eigenes Auto'))
    expect(await screen.findByText('1.175 €')).toBeTruthy()

    fireEvent.change(screen.getByTestId('arbeitstage-fahrtage'), { target: { value: '100' } })
    // 100 days x 15 km x 0,30 € = 450 €, not the 1.175 € of the derived days.
    expect(await screen.findByText('450 €')).toBeTruthy()
    expect(screen.queryByText('1.175 €')).toBeNull()
    fireEvent.click(screen.getByTestId('arbeitstage-kuerzeste'))
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies.at(-1)).toMatchObject({ travelDays: 100, shortestRouteConfirmed: true, secondTravelDays: null })
  })

  it('withdraws the shortest-route confirmation when the km change, and refuses more days than the weekdays', async () => {
    const bodies = recordCommutePuts()
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    fireEvent.change(await screen.findByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByTestId('arbeitstage-kuerzeste'))
    fireEvent.change(screen.getByLabelText('Einfache Entfernung in km'), { target: { value: '16' } })
    fireEvent.change(screen.getByTestId('arbeitstage-fahrtage'), { target: { value: '300' } })
    expect(await screen.findByTestId('arbeitstage-fahrtage-widerspruch')).toBeTruthy()
    fireEvent.change(screen.getByTestId('arbeitstage-fahrtage'), { target: { value: '0' } })
    await waitFor(() => expect(screen.queryByTestId('arbeitstage-fahrtage-widerspruch')).toBeNull())
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies.at(-1)).toMatchObject({ oneWayKm: 16, travelDays: 0, shortestRouteConfirmed: null })
  })

  it('saves a changed field when it is left, without moving on — closing the sheet keeps it (#443 AC 7)', async () => {
    const bodies: { oneWayKm: number | null }[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        bodies.push((await request.json()) as { oneWayKm: number | null })
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)

    const km = await screen.findByLabelText('Einfache Entfernung in km')
    fireEvent.change(km, { target: { value: '33' } })
    fireEvent.blur(km)

    await waitFor(() => expect(bodies.map((b) => b.oneWayKm)).toEqual([33]))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('„Weiter“ right after typing still moves on, although leaving the field already saves', async () => {
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    const km = await screen.findByLabelText('Einfache Entfernung in km')
    fireEvent.change(km, { target: { value: '33' } })
    fireEvent.blur(km)
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('leaving a field without a change saves nothing', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    renderWorkdays(() => {}, 2025)
    fireEvent.blur(await screen.findByLabelText('Urlaubstage'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toEqual([])
  })

  it('saves the facts before moving on', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
    )
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)

    fireEvent.change(await screen.findByLabelText('Urlaubstage'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Einfache Entfernung in km'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Eigenes Auto'))
    fireEvent.change(screen.getByLabelText('Arbeitsort (PLZ, Ort, Straße)'), { target: { value: '79539 Lörrach, Hauptstraße 1' } })
    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies).toEqual([
      {
        workdays: [1, 2, 3, 4, 5],
        vacationDays: 30,
        sickDays: 0,
        homeOfficeDays: 0,
        publicHolidays: null,
        publicHolidayRegion: null,
        oneWayKm: 15,
        transport: 'pkw',
        workplace: '79539 Lörrach, Hauptstraße 1',
        professionalBodiesEur: null,
        professionalBodiesNote: null,
        workEquipmentEur: null,
        workEquipmentNote: null,
        accountFeesEur: null,
        otherWorkExpensesEur: null,
        otherWorkExpensesNote: null,
        periodTo: null,
        secondOneWayKm: null,
        secondTransport: null,
        secondWorkplace: null,
        secondFrom: null,
        travelDays: null,
        secondTravelDays: null,
        shortestRouteConfirmed: null,
        secondShortestRouteConfirmed: null,
      },
    ])
  })

  it('saves further Werbungskosten with what they were (ADR-0076)', async () => {
    const bodies = recordCommutePuts()
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    fireEvent.change(await screen.findByTestId('werbungskosten-arbeitsmittel'), { target: { value: '110' } })
    fireEvent.change(screen.getByTestId('werbungskosten-arbeitsmittel-art'), { target: { value: 'Berufskleidung' } })
    fireEvent.change(screen.getByTestId('werbungskosten-kontofuehrung'), { target: { value: '16' } })
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies.at(-1)).toMatchObject({ workEquipmentEur: 110, workEquipmentNote: 'Berufskleidung', accountFeesEur: 16, professionalBodiesEur: null })
  })

  it('saves a change of job during the year as a second way with its dates (ADR-0079)', async () => {
    const bodies = recordCommutePuts()
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    fireEvent.change(await screen.findByTestId('arbeitstage-km'), { target: { value: '12' } })
    fireEvent.click(screen.getByTestId('arbeitstage-transport-pkw'))
    fireEvent.click(screen.getByTestId('arbeitsweg-wechsel'))
    fireEvent.change(screen.getByTestId('arbeitsweg-bis'), { target: { value: '31.10.2025' } })
    fireEvent.change(screen.getByTestId('arbeitsweg-zweiter-ab'), { target: { value: '01.11.2025' } })
    fireEvent.change(screen.getByTestId('arbeitsweg-zweiter-km'), { target: { value: '80' } })
    fireEvent.click(screen.getByTestId('arbeitsweg-zweiter-transport-pkw'))
    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies.at(-1)).toMatchObject({ oneWayKm: 12, periodTo: '31.10.2025', secondOneWayKm: 80, secondTransport: 'pkw', secondFrom: '01.11.2025' })
  })

  it('does not send a stale secondTransport=null when blurring arbeitsweg-zweiter-km onto the transport chip', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        await new Promise((r) => setTimeout(r, 25))
        bodies.push(body)
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null }, { status: 200 })
      }),
    )
    const onDone = vi.fn()
    renderWorkdays(onDone, 2025)
    const km = await screen.findByTestId('arbeitstage-km')
    fireEvent.change(km, { target: { value: '12' } })
    fireEvent.blur(km)
    fireEvent.click(screen.getByTestId('arbeitstage-transport-pkw'))
    fireEvent.click(screen.getByTestId('arbeitsweg-wechsel'))
    const bis = screen.getByTestId('arbeitsweg-bis')
    fireEvent.change(bis, { target: { value: '31.10.2025' } })
    fireEvent.blur(bis)
    const ab = screen.getByTestId('arbeitsweg-zweiter-ab')
    fireEvent.change(ab, { target: { value: '01.11.2025' } })
    fireEvent.blur(ab)
    const km2 = screen.getByTestId('arbeitsweg-zweiter-km')
    fireEvent.change(km2, { target: { value: '80' } })
    // Real browser blurs the input on mousedown before click fires on the chip
    fireEvent.blur(km2)
    fireEvent.click(screen.getByTestId('arbeitsweg-zweiter-transport-pkw'))
    const ort2 = screen.getByTestId('arbeitsweg-zweiter-ort')
    fireEvent.change(ort2, { target: { value: '4058 Basel, Beispielstrasse 1' } })
    fireEvent.blur(ort2)
    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      oneWayKm: 12,
      periodTo: '31.10.2025',
      secondOneWayKm: 80,
      secondTransport: 'pkw',
      secondFrom: '01.11.2025',
    })
  })

  it('holds back a half-typed date instead of saving it', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/2025/arbeitsweg', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null }, { status: 200 })
      }),
    )
    renderWorkdays(() => {}, 2025)
    fireEvent.click(await screen.findByTestId('arbeitsweg-wechsel'))
    fireEvent.change(screen.getByTestId('arbeitsweg-bis'), { target: { value: '31.10.' } })
    fireEvent.click(screen.getByText('Weiter'))

    expect(await screen.findByText('Bitte als TT.MM.JJJJ eingeben.')).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('invalidates commute, cockpitSummary, and taxEstimate after saving before calling onDone', async () => {
    let commuteGetCount = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () => {
        commuteGetCount += 1
        return HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })
      }),
      http.put('*/v1/steuerjahre/2025/arbeitsweg', () => HttpResponse.json({ inputs: null, workdays: null, commuterAllowance: null })),
    )
    const onDone = vi.fn()
    const onBack = vi.fn()
    const { queryClient } = renderWorkdays(onDone, 2025, undefined, onBack)
    const commuteKey = getCommuteControllerGetQueryKey(2025)
    const summaryKey = getCockpitControllerGetCockpitSummaryQueryKey(2025)
    const estimateKey = getTaxEstimateControllerGetQueryKey(2025)
    queryClient.setQueryData(commuteKey, { status: 200, data: { inputs: null, workdays: null, commuterAllowance: null }, headers: new Headers() })
    queryClient.setQueryData(summaryKey, { status: 200, data: null, headers: new Headers() })
    queryClient.setQueryData(estimateKey, { status: 200, data: { kind: 'offen' }, headers: new Headers() })

    await screen.findByLabelText('Urlaubstage')
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    await waitFor(() => expect(commuteGetCount).toBeGreaterThanOrEqual(2))
    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(estimateKey)?.isInvalidated).toBe(true)
  })
})

describe('ArbeitstageScreen holiday region from the address (#451 slice 3)', () => {
  const address = (plz: string, wohnort: string) =>
    http.get('*/v1/stammdaten', () =>
      HttpResponse.json({
        geburtsdatum: null, strasse: null, hausnummer: null, hausnummerZusatz: null, plz, wohnort, beruf: null, religion: null,
        familienstand: null, familienstandSeit: null, iban: null, kontoinhaber: null, finanzamt: null, telefon: null, missing: [],
      }),
    )

  it('preselects the Bundesland of the master-data postal code, marked and with a holiday suggestion', async () => {
    server.use(address('80331', 'München'))
    renderWorkdays()
    const hint = await screen.findByTestId('feiertage-region-aus-plz')
    expect(hint.textContent).toBe('Bayern · aus deiner PLZ')
    expect((screen.getByTestId('arbeitstage-feiertage-anzahl') as HTMLInputElement).value).not.toBe('')
  })

  it('stays changeable: picking another region drops the mark', async () => {
    server.use(address('80331', 'München'))
    renderWorkdays()
    await screen.findByTestId('feiertage-region-aus-plz')
    fireEvent.click(screen.getByTestId('feiertage-region-BE'))
    expect(screen.queryByTestId('feiertage-region-aus-plz')).toBeNull()
  })

  it('suggests nothing without an address', async () => {
    renderWorkdays()
    await screen.findByText('Wochentage im Jahr')
    expect(screen.queryByTestId('feiertage-region-aus-plz')).toBeNull()
  })
})

describe('„Wie 2025 übernehmen“ for the Arbeitsweg (#452 slice 4, AC 7)', () => {
  const prior = {
    inputs: { workdays: [1, 2, 3, 4], vacationDays: 28, sickDays: 3, homeOfficeDays: 40, oneWayKm: 18, transport: 'pkw', workplace: 'Freiburg', publicHolidayRegion: 'BW' },
    workdays: { weekdays: 209, workdays: 178, commuteDays: 138 },
    commuterAllowance: 745,
  }

  it('fills the form from last year on a click, marks it, and saves only on „Weiter“', async () => {
    let puts = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () => HttpResponse.json(prior)),
      http.put('*/v1/steuerjahre/2026/arbeitsweg', () => {
        puts += 1
        return HttpResponse.json(prior)
      }),
    )
    renderWorkdays(() => {}, 2026)
    const button = await screen.findByTestId('wie-vorjahr-arbeitsweg')
    expect(((await screen.findByLabelText('Urlaubstage')) as HTMLInputElement).value).toBe('')

    fireEvent.click(button)
    expect((screen.getByLabelText('Urlaubstage') as HTMLInputElement).value).toBe('28')
    expect((screen.getByLabelText('Einfache Entfernung in km') as HTMLInputElement).value).toBe('18')
    expect(screen.getByTestId('wie-vorjahr-markiert').textContent).toContain('aus 2025')
    expect(puts).toBe(0)

    fireEvent.click(screen.getByTestId('arbeitstage-weiter'))
    await waitFor(() => expect(puts).toBe(1))
  })

  it('does not offer a takeover once the year has its own values', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () => HttpResponse.json(prior)),
      http.get('*/v1/steuerjahre/2026/arbeitsweg', () => HttpResponse.json(prior)),
    )
    renderWorkdays(() => {}, 2026)
    await screen.findByLabelText('Urlaubstage')
    expect(screen.queryByTestId('wie-vorjahr-arbeitsweg')).toBeNull()
  })
})
