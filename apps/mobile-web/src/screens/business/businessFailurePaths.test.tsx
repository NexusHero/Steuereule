// P2 of the beta readiness: the failure paths of the self-employed area. A profile that did not load never
// lets a page overwrite stored facts (WEB-30, WEB-31); a write sends only the key it changed; the server's
// raw English text never reaches the page and a lost account leads to the sign-in (WEB-44); a double tap books
// once (NC-03); a failed secondary read says so (NC-10, NC-17); a link to an unknown business opens none (NC-16).
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { BusinessScreen } from './BusinessScreen'
import { BASE_PROFILE, BASE_URL, EMPTY_BOOK, renderBusiness, useBusinessDefaults, YEAR } from './businessTestKit'

const LOSSES = { facts: {}, rules: {}, businessProfitEur: -100, year: { newLossEur: 500, carryForwardDeductedEur: 0, remainingCarryForwardEur: 0 }, carryBack: null }
const VA = { period: 'quartal', periodSource: 'vorjahressteuer', extension: false, specialPrepaymentEur: null, periods: [], totalEur: 0, ecSalesList: { period: 'quartal', reports: [] } }
const STORED_LOSSES = { carriedForwardEur: 5000, roomEur: [10, 20], carriedBackEur: 3, waiveCarryBack: true }
const STORED_VAT = { exemptFromBookkeeping: true, specialPrepaymentEur: 400, chooseMonthly: true, extension: true }

function recordPuts(): unknown[] {
  const puts: unknown[] = []
  server.use(
    http.put(BASE_URL, async ({ request }) => {
      puts.push(await request.json())
      return HttpResponse.json(BASE_PROFILE)
    }),
  )
  return puts
}

describe('Verluste waits for the profile it edits (WEB-30)', () => {
  it('shows a load failure with a retry, no field, when the profile read fails; nothing is sent', async () => {
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/verluste`, () => HttpResponse.json(LOSSES)),
      http.get(BASE_URL, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 }) : HttpResponse.json({ ...BASE_PROFILE, lossFacts: STORED_LOSSES })
      }),
    )
    const puts = recordPuts()
    renderBusiness('verluste')
    expect(await screen.findByTestId('business-fehler')).toBeTruthy()
    expect(screen.queryByTestId('verluste-vortrag')).toBeNull()
    expect(screen.queryByTestId('verluste-ruecktrag-ja')).toBeNull()
    expect(screen.queryByText('Internal server error')).toBeNull()
    fireEvent.click(screen.getByTestId('fehler-erneut-versuchen'))
    const carried = await screen.findByTestId('verluste-vortrag')
    expect((carried as HTMLInputElement).value).toBe('5000')
    fireEvent.change(carried, { target: { value: '40.000,50' } })
    fireEvent.blur(carried)
    await waitFor(() => expect(puts).toEqual([{ lossFacts: { carriedForwardEur: 40000.5 } }]))
  })

  it('offers no field while the profile is still on its way', async () => {
    server.use(
      http.get(`${BASE_URL}/verluste`, () => HttpResponse.json(LOSSES)),
      http.get(BASE_URL, async () => delay('infinite')),
    )
    renderBusiness('verluste')
    expect(await screen.findByText('Lade …')).toBeTruthy()
    expect(screen.queryByTestId('verluste-vortrag')).toBeNull()
  })

  it('says what is no amount instead of dropping it', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, lossFacts: STORED_LOSSES })
    server.use(http.get(`${BASE_URL}/verluste`, () => HttpResponse.json(LOSSES)))
    const puts = recordPuts()
    renderBusiness('verluste')
    const carried = await screen.findByTestId('verluste-vortrag')
    fireEvent.change(carried, { target: { value: '1.2.3' } })
    fireEvent.blur(carried)
    expect(await screen.findByText('Mindestens ein Betrag ist keine Zahl.')).toBeTruthy()
    expect(puts).toEqual([])
  })
})

describe('Voranmeldungen waits for the profile it edits (WEB-31)', () => {
  it('shows a load failure, no choice, when the profile read fails; nothing is sent', async () => {
    server.use(
      http.get(`${BASE_URL}/umsatzsteuer/voranmeldungen`, () => HttpResponse.json(VA)),
      http.get(BASE_URL, () => HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 })),
    )
    const puts = recordPuts()
    renderBusiness('voranmeldungen')
    expect(await screen.findByTestId('business-fehler')).toBeTruthy()
    expect(screen.queryByTestId('va-dauerfrist')).toBeNull()
    expect(screen.queryByTestId('va-periode-monat')).toBeNull()
    expect(puts).toEqual([])
  })

  it('sends only the fact the user changed, never the others it did not touch', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, vatPeriodFacts: { ...STORED_VAT, period: 'monat' } })
    server.use(http.get(`${BASE_URL}/umsatzsteuer/voranmeldungen`, () => HttpResponse.json(VA)))
    const puts = recordPuts()
    renderBusiness('voranmeldungen')
    fireEvent.click(await screen.findByTestId('va-periode-auto'))
    await waitFor(() => expect(puts).toEqual([{ vatPeriodFacts: { period: null } }]))
  })
})

describe('the area speaks the shared wording and leads to an account (WEB-44, NC-05)', () => {
  function renderWithAccount(page: string | undefined, account: { onSignIn: () => void; onCreateAccount: () => void }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrap = (node: ReactNode) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={createAppI18n('de')}>
          <ThemeProvider mode="light">{node}</ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
    return render(wrap(<BusinessScreen taxYear={YEAR} person="A" page={page} account={account} onBack={() => {}} onOpenPage={() => {}} />))
  }

  it('never shows "Internal server error"; says it in German with a retry', async () => {
    server.use(http.get(BASE_URL, () => HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 })))
    renderBusiness('profil')
    expect(await screen.findByTestId('business-fehler')).toBeTruthy()
    expect(screen.getByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(screen.queryByText('Internal server error')).toBeNull()
    expect(screen.getByTestId('fehler-erneut-versuchen')).toBeTruthy()
  })

  it('a guest session gets the sign-in and the account, not the English text and a pointless retry', async () => {
    server.use(http.get(`${BASE_URL}/buch`, () => HttpResponse.json({ statusCode: 401, code: 'ACCOUNT_REQUIRED', message: 'This endpoint requires a signed-in account, not a guest session.' }, { status: 401 })))
    const onSignIn = vi.fn()
    const onCreateAccount = vi.fn()
    renderWithAccount('buch', { onSignIn, onCreateAccount })
    expect(await screen.findByText('Dafür brauchst du ein kostenloses Konto. Als Gast geht das nicht.')).toBeTruthy()
    expect(screen.queryByText(/This endpoint requires/)).toBeNull()
    expect(screen.queryByTestId('fehler-erneut-versuchen')).toBeNull()
    fireEvent.click(screen.getByTestId('business-anmelden'))
    fireEvent.click(screen.getByTestId('business-konto-anlegen'))
    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })

  it('a refused save of a lost account leads to the sign-in too', async () => {
    useBusinessDefaults()
    server.use(http.put(BASE_URL, () => HttpResponse.json({ statusCode: 401, code: 'ACCOUNT_REQUIRED', message: 'This endpoint requires a signed-in account, not a guest session.' }, { status: 401 })))
    const onSignIn = vi.fn()
    renderWithAccount('profil', { onSignIn, onCreateAccount: () => {} })
    fireEvent.click(await screen.findByTestId('profil-art-gewerbe'))
    fireEvent.click(await screen.findByTestId('business-anmelden'))
    expect(onSignIn).toHaveBeenCalled()
  })
})

describe('one tap books once (NC-03)', () => {
  it('a double tap on „Buchen“ posts one booking', async () => {
    useBusinessDefaults()
    let posts = 0
    server.use(
      http.post(`${BASE_URL}/buchungen`, async () => {
        posts += 1
        await delay(30)
        return HttpResponse.json({ number: 1 })
      }),
    )
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-neu'))
    fireEvent.change(screen.getByTestId('buch-datum'), { target: { value: '01.03.2025' } })
    fireEvent.change(screen.getByTestId('buch-text'), { target: { value: 'Miete' } })
    fireEvent.change(screen.getByTestId('buch-belegnummer'), { target: { value: 'R1' } })
    fireEvent.change(screen.getByTestId('buch-soll'), { target: { value: '4210' } })
    fireEvent.change(screen.getByTestId('buch-haben'), { target: { value: '1200' } })
    fireEvent.change(screen.getByTestId('buch-betrag'), { target: { value: '1.000,00' } })
    const book = screen.getByTestId('buch-buchen')
    fireEvent.click(book)
    fireEvent.click(book)
    await waitFor(() => expect(screen.queryByTestId('buch-formular')).toBeNull())
    expect(posts).toBe(1)
  })

  it('a double tap on „Lohnlauf buchen“ posts one run', async () => {
    let posts = 0
    server.use(
      http.get(`${BASE_URL}/lohn`, () => HttpResponse.json({ runs: [], wageTaxPeriod: 'monat', wageTaxReturns: [], minijobCharges: [], unassignedChurchCodes: [] })),
      http.post(`${BASE_URL}/lohn`, async () => {
        posts += 1
        await delay(30)
        return HttpResponse.json({})
      }),
    )
    renderBusiness('lohn')
    fireEvent.change(await screen.findByTestId('lohn-month'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('lohn-employee'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByTestId('lohn-grossEur'), { target: { value: '3.000' } })
    const button = screen.getByTestId('lohn-buchen')
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(posts).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(posts).toBe(1)
  })
})

describe('a failed secondary read says so (NC-10, NC-17)', () => {
  it('the export names a failed procedure documentation and offers a retry, not „Lade …“ for good', async () => {
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ statusCode: 500 }, { status: 500 })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ statusCode: 500 }, { status: 500 })),
    )
    renderBusiness('export')
    expect(await screen.findByTestId('verfahren-ladefehler')).toBeTruthy()
    expect(screen.getByTestId('ebilanz-ladefehler')).toBeTruthy()
    expect(screen.queryByText('Lade …')).toBeNull()
    server.use(http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: [] })))
    fireEvent.click(screen.getByTestId('verfahren-erneut'))
    expect(await screen.findByTestId('verfahren-vollstaendig')).toBeTruthy()
  })

  it('the overview names a failed list of businesses instead of showing only the first', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/betriebe`, () => HttpResponse.json({ statusCode: 500 }, { status: 500 })))
    renderBusiness(undefined, { onChangeBusiness: () => {} })
    expect(await screen.findByTestId('business-betriebe-fehler')).toBeTruthy()
    expect(screen.getByTestId('business-betriebe-erneut')).toBeTruthy()
  })
})

describe('a link to a business that does not exist (NC-16)', () => {
  it('opens no phantom profile and leads to the first business', async () => {
    useBusinessDefaults(BASE_PROFILE, EMPTY_BOOK)
    server.use(http.get(`${BASE_URL}/betriebe`, () => HttpResponse.json([{ business: 1, name: null, kind: null, mode: 'euer' }])))
    const onChangeBusiness = vi.fn()
    renderBusiness(undefined, { business: 99, onChangeBusiness })
    fireEvent.click(await screen.findByTestId('business-betrieb-zum-ersten'))
    expect(onChangeBusiness).toHaveBeenCalledWith(1)
    expect(screen.queryByTestId('business-status')).toBeNull()
  })
})
