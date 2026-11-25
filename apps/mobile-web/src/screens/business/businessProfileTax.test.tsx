// Profile, tax pages, export, checkout, profession and shares of the self-employed area (ADR-0101):
// the paths a user takes when saving, and what the page says when the API refuses or the read fails.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CheckoutPage } from './CheckoutPage'
import { BASE_PROFILE, BASE_URL, CATALOGUES, renderBusiness, useBusinessDefaults, useCatalogues, YEAR } from './businessTestKit'
import { confirmAction } from '../../confirm/confirmInTest'

const SMALL_OK = { eligible: true, priorYearLimitEur: 25_000, currentYearLimitEur: 100_000, crossed: null, foundingYear: false, priorYearKnown: true, turnoverEur: 0, matchesProfile: true }

afterEach(() => vi.restoreAllMocks())

const refusal = (status: number, message: string, code = 'X') => HttpResponse.json({ statusCode: status, code, message }, { status })

/** The first read fails once, then answers: the retry button of the error state brings the page. */
function failOnce(url: string, body: unknown) {
  let calls = 0
  server.use(
    http.get(url, () => {
      calls += 1
      return calls === 1 ? refusal(500, 'Kurz kaputt.') : HttpResponse.json(body as object)
    }),
  )
}

/** Records the JSON bodies a PUT of the profile receives; answers with the profile. */
function recordPuts(status = 200) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.put(BASE_URL, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return status === 200 ? HttpResponse.json(BASE_PROFILE) : refusal(status, 'Das Profil ist gesperrt.')
    }),
  )
  return bodies
}

async function retryThenFind(testId: string) {
  fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
  expect(await screen.findByTestId(testId)).toBeTruthy()
}

describe('the profile', () => {
  it('retries a failed first read', async () => {
    failOnce(BASE_URL, BASE_PROFILE)
    renderBusiness('profil')
    await retryThenFind('selbststaendig-profil')
  })

  it('sends all four answers of the questions, the unanswered ones as „Nein“', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, professionAnswers: { ownExpertWork: true } })
    const puts = recordPuts()
    renderBusiness('profil')
    fireEvent.click(await screen.findByTestId('profil-frage-leadsPersonally-ja'))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ professionAnswers: { ownExpertWork: true, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: false } })
  })

  it('saves the way the books are kept, the chart, Kleinunternehmer and the VAT method, each on its own', async () => {
    useBusinessDefaults()
    const puts = recordPuts()
    renderBusiness('profil')
    fireEvent.click(await screen.findByTestId('profil-modus-bilanz'))
    fireEvent.click(screen.getByTestId('profil-konten-SKR04'))
    fireEvent.click(screen.getByTestId('profil-klein-ja'))
    fireEvent.click(screen.getByTestId('profil-ust-soll'))
    fireEvent.click(screen.getByTestId('profil-art-gewerbe'))
    await waitFor(() => expect(puts).toHaveLength(5))
    expect(puts).toEqual([{ mode: 'bilanz' }, { chart: 'SKR04' }, { smallBusiness: true }, { vatMethod: 'soll' }, { confirmedKind: 'gewerbe' }])
  })

  it('asks the § 148 AO exemption only with the Istversteuerung and sends only that VAT fact (§ 20 Nr. 2 UStG; the API merges)', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, vatPeriodFacts: { extension: true } })
    const puts = recordPuts()
    renderBusiness('profil')
    fireEvent.click(await screen.findByTestId('profil-148-ja'))
    await waitFor(() => expect(puts).toEqual([{ vatPeriodFacts: { exemptFromBookkeeping: true } }]))
  })

  it('saves the start date once it is a full date, and clears it when emptied', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, startDate: '2024-05-01' })
    const puts = recordPuts()
    renderBusiness('profil')
    const field = await screen.findByTestId('profil-beginn')
    expect((field as HTMLInputElement).value).toBe('01.05.2024')
    fireEvent.change(field, { target: { value: '01.06.20' } })
    expect(puts).toHaveLength(0)
    fireEvent.change(field, { target: { value: '01.06.2024' } })
    await waitFor(() => expect(puts).toEqual([{ startDate: '2024-06-01' }]))
    fireEvent.change(field, { target: { value: '' } })
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1]).toEqual({ startDate: null })
  })

  it('shows an unclear suggestion and the refusal of a save with its reason', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, suggestion: { suggestion: 'unklar', reasons: [], basis: [] } })
    recordPuts(409)
    renderBusiness('profil')
    expect(await screen.findByText('Unklar – bitte entscheide selbst')).toBeTruthy()
    fireEvent.click(screen.getByTestId('profil-modus-bilanz'))
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
  })

  it('opens the pages behind the profile', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    const onOpenPage = vi.fn()
    renderBusiness('profil', { onOpenPage })
    fireEvent.click(await screen.findByTestId('profil-zu-beruf'))
    fireEvent.click(screen.getByTestId('profil-zu-gewerbedaten'))
    fireEvent.click(screen.getByTestId('profil-zu-beteiligungen'))
    expect(onOpenPage.mock.calls.map((c) => c[0])).toEqual(['beruf', 'gewerbedaten', 'beteiligungen'])
  })

  it('leaves the municipality and the trade-tax page out for a Freiberufler', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'freiberuf' })
    renderBusiness('profil')
    await screen.findByTestId('selbststaendig-profil')
    expect(screen.queryByTestId('profil-gemeinde')).toBeNull()
    expect(screen.queryByTestId('profil-zu-gewerbedaten')).toBeNull()
    expect(screen.getByTestId('profil-zu-beteiligungen')).toBeTruthy()
  })

  describe('the Hebesatz', () => {
    const municipality = (ags: string, name: string) => ({ ags, name, land: 'BY', multiplierPercent: 400 })
    const profileOfGewerbe = () => useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    const search = (name: string) => {
      fireEvent.change(screen.getByTestId('profil-gemeinde-name'), { target: { value: name } })
      fireEvent.click(screen.getByTestId('profil-hebesatz-suchen'))
    }

    it('waits for two letters before it searches', async () => {
      profileOfGewerbe()
      renderBusiness('profil')
      await screen.findByTestId('profil-gemeinde-name')
      expect(screen.getByTestId('profil-hebesatz-suchen').getAttribute('aria-disabled')).toBe('true')
      fireEvent.change(screen.getByTestId('profil-gemeinde-name'), { target: { value: 'Ne' } })
      expect(screen.getByTestId('profil-hebesatz-suchen').getAttribute('aria-disabled')).not.toBe('true')
    })

    it('takes the found municipality over with its note, and drops a corrected multiplier', async () => {
      profileOfGewerbe()
      const puts = recordPuts()
      server.use(http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, () => HttpResponse.json({ kind: 'found', municipality: municipality('9', 'Neustadt'), tableYear: 2025, note: 'Stand der Tabelle.' })))
      renderBusiness('profil')
      await screen.findByTestId('profil-gemeinde-name')
      search('Neustadt')
      expect(await screen.findByText('Stand der Tabelle.')).toBeTruthy()
      fireEvent.click(screen.getByTestId('profil-hebesatz-nehmen-9'))
      await waitFor(() => expect(puts).toEqual([{ municipalityAgs: '9', multiplierOverride: null }]))
    })

    it('takes one of several choices', async () => {
      profileOfGewerbe()
      const puts = recordPuts()
      server.use(http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, () => HttpResponse.json({ kind: 'choices', choices: [municipality('1', 'Neustadt a.d. Donau'), municipality('2', 'Neustadt b. Coburg')], tableYear: 2025, note: null })))
      renderBusiness('profil')
      await screen.findByTestId('profil-gemeinde-name')
      search('Neustadt')
      fireEvent.click(await screen.findByTestId('profil-hebesatz-nehmen-2'))
      await waitFor(() => expect(puts).toEqual([{ municipalityAgs: '2', multiplierOverride: null }]))
    })

    it('says the search did not work when the API refuses or the request fails', async () => {
      profileOfGewerbe()
      server.use(http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, () => refusal(500, 'kaputt')))
      renderBusiness('profil')
      await screen.findByTestId('profil-gemeinde-name')
      search('Berlin')
      expect(await screen.findByText('Die Suche hat nicht geklappt.')).toBeTruthy()
      server.use(http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, () => HttpResponse.error()))
      search('Hamburg')
      await waitFor(() => expect(screen.getByText('Die Suche hat nicht geklappt.')).toBeTruthy())
    })

    it('searches on Enter in the field', async () => {
      profileOfGewerbe()
      server.use(http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, () => HttpResponse.json({ kind: 'not_found', tableYear: 2025, note: null })))
      renderBusiness('profil')
      const input = await screen.findByTestId('profil-gemeinde-name')
      fireEvent.change(input, { target: { value: 'Nirgendwo' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
      expect(await screen.findByTestId('profil-hebesatz-keiner')).toBeTruthy()
    })

    it('saves a multiplier the user types, none when the field is emptied, and refuses what is no number (WEB-46)', async () => {
      useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe', multiplierOverride: 380 })
      const puts = recordPuts()
      renderBusiness('profil')
      const field = await screen.findByTestId('profil-hebesatz-korrektur')
      expect((field as HTMLInputElement).value).toBe('380')
      fireEvent.blur(field)
      expect(puts).toHaveLength(0)
      fireEvent.change(field, { target: { value: '450,5' } })
      fireEvent.blur(field)
      await waitFor(() => expect(puts).toHaveLength(1))
      fireEvent.change(field, { target: { value: '' } })
      fireEvent.blur(field)
      await waitFor(() => expect(puts).toHaveLength(2))
      fireEvent.change(field, { target: { value: 'viel' } })
      fireEvent.blur(field)
      expect(await screen.findByText('Mindestens ein Betrag ist keine Zahl.')).toBeTruthy()
      expect(puts).toEqual([{ multiplierOverride: 450.5 }, { multiplierOverride: null }])
    })
  })
})

describe('Umsatzsteuer', () => {
  const VAT = (balanceEur: number) => ({
    figures: {},
    result: { outputVat: { standard: 0, reduced: 0, zero: 0 }, inputVatDeductibleEur: 0, inputVatCorrectionEur: 0, vatOfYearEur: 0, prepaymentsEur: 0, balanceEur },
    cashAccountingAllowed: true,
    smallBusiness: SMALL_OK,
    inputVatCorrections: [],
  })
  const useVat = (balanceEur = 100) => server.use(http.get(`${BASE_URL}/umsatzsteuer`, () => HttpResponse.json(VAT(balanceEur))))

  it('retries a failed first read', async () => {
    useBusinessDefaults()
    failOnce(`${BASE_URL}/umsatzsteuer`, VAT(0))
    renderBusiness('umsatzsteuer')
    await retryThenFind('umsatzsteuer-seite')
  })

  it('calls a negative balance a refund, and says a Kleinunternehmer owes no VAT', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, smallBusiness: true })
    useVat(-250)
    renderBusiness('umsatzsteuer')
    expect(await screen.findByText('Erstattung')).toBeTruthy()
    expect(screen.getByTestId('ust-saldo').textContent).toBe('250,00 €')
    expect(screen.getByTestId('ust-klein')).toBeTruthy()
  })

  it('warns when the profile claims the Kleinunternehmer rule and the founding year crossed its limit (§ 19 Abs. 2 UStG)', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, smallBusiness: true })
    server.use(
      http.get(`${BASE_URL}/umsatzsteuer`, () =>
        HttpResponse.json({ ...VAT(0), smallBusiness: { ...SMALL_OK, eligible: false, crossed: 'current_year', currentYearLimitEur: 25_000, foundingYear: true, turnoverEur: 26_000, matchesProfile: false } }),
      ),
    )
    renderBusiness('umsatzsteuer')
    const note = (await screen.findByTestId('ust-klein-grenze')).textContent?.replace(/\s/g, ' ')
    expect(note).toContain('Gründungsjahr')
    expect(note).toContain('26.000,00 €')
    expect(note).toContain('25.000,00 €')
  })

  it('shows the § 15a correction of the year and the line per asset', async () => {
    useBusinessDefaults()
    server.use(
      http.get(`${BASE_URL}/umsatzsteuer`, () =>
        HttpResponse.json({ ...VAT(0), result: { ...VAT(0).result, inputVatCorrectionEur: -570 }, inputVatCorrections: [{ assetId: 'a1', label: 'Lieferwagen', correctionEur: -570, inPrepayment: true }] }),
      ),
    )
    renderBusiness('umsatzsteuer')
    expect((await screen.findByTestId('ust-15a')).textContent?.replace(/\s/g, ' ')).toContain('570,00 €')
    const list = screen.getByTestId('ust-15a-liste').textContent ?? ''
    expect(list).toContain('Lieferwagen')
    expect(list).toContain('Voranmeldung')
  })

  it('says from which supply the turnover is taxed once the limit was passed in the year (§ 19 Abs. 1 Satz 1 UStG)', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, smallBusiness: true })
    server.use(
      http.get(`${BASE_URL}/umsatzsteuer`, () =>
        HttpResponse.json({ ...VAT(0), smallBusiness: { ...SMALL_OK, eligible: false, crossed: 'current_year', turnoverEur: 101_000, matchesProfile: false, taxedFrom: '2025-11-02' } }),
      ),
    )
    renderBusiness('umsatzsteuer')
    expect((await screen.findByTestId('ust-klein-ab')).textContent).toContain('02.11.2025')
  })

  it('says the year before is unknown when there is no book for it', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, smallBusiness: true })
    server.use(http.get(`${BASE_URL}/umsatzsteuer`, () => HttpResponse.json({ ...VAT(0), smallBusiness: { ...SMALL_OK, priorYearKnown: false } })))
    renderBusiness('umsatzsteuer')
    expect((await screen.findByTestId('ust-klein-vorjahr')).textContent?.replace(/\s/g, ' ')).toContain('25.000,00 €')
  })

  it('saves the prepayments in cents when the field is left, and none when emptied', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, vatPrepaymentsCents: 100050 })
    useVat()
    const puts = recordPuts()
    renderBusiness('umsatzsteuer')
    const field = await screen.findByTestId('ust-vorauszahlungen')
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('1000,5'))
    fireEvent.blur(field)
    expect(puts).toHaveLength(0)
    fireEvent.change(field, { target: { value: '1.200,00' } })
    fireEvent.blur(field)
    await waitFor(() => expect(puts).toHaveLength(1))
    fireEvent.change(field, { target: { value: '  ' } })
    fireEvent.blur(field)
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts).toEqual([{ vatPrepaymentsCents: 120000 }, { vatPrepaymentsCents: null }])
  })

  it('refuses a prepayment that is no amount without asking the API, and shows a refusal of the API', async () => {
    useBusinessDefaults()
    useVat()
    const puts = recordPuts(409)
    renderBusiness('umsatzsteuer')
    const field = await screen.findByTestId('ust-vorauszahlungen')
    fireEvent.change(field, { target: { value: 'zwölf' } })
    fireEvent.blur(field)
    expect(await screen.findByText('Mindestens ein Betrag ist keine Zahl.')).toBeTruthy()
    expect(puts).toHaveLength(0)
    fireEvent.change(field, { target: { value: '12' } })
    fireEvent.blur(field)
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
  })
})

describe('Gewerbesteuer', () => {
  it('retries a failed first read', async () => {
    failOnce(`${BASE_URL}/gewerbesteuer`, { status: 'entfaellt', reason: 'Freiberufler.' })
    renderBusiness('gewerbesteuer')
    await retryThenFind('gewerbesteuer-seite')
  })

  it('leads from „open“ to the profile, where the Hebesatz is', async () => {
    server.use(http.get(`${BASE_URL}/gewerbesteuer`, () => HttpResponse.json({ status: 'offen', missing: ['hebesatz'] })))
    const onOpenPage = vi.fn()
    renderBusiness('gewerbesteuer', { onOpenPage })
    fireEvent.click(await screen.findByTestId('gewst-zum-profil'))
    expect(onOpenPage).toHaveBeenCalledWith('profil')
  })

  it('derives the profit from the chain when the API sends none, names a corrected Hebesatz and the Fehlbetrag left', async () => {
    const result = { additionsEur: 1000, deductionsEur: 200, tradeIncomeBeforeLossEur: 51000, lossUsedEur: 0, lossRemainingEur: 3000, roundedTradeIncomeEur: 51000, allowanceEur: 24500, baseAmountEur: 927, multiplierPercent: 380, tradeTaxEur: 3522.6 }
    server.use(http.get(`${BASE_URL}/gewerbesteuer`, () => HttpResponse.json({ status: 'berechnet', result, multiplier: { percent: 380, source: 'korrektur', tableYear: null, note: null } })))
    renderBusiness('gewerbesteuer')
    // 51.000 before the loss − 1.000 additions + 200 deductions
    expect((await screen.findByTestId('gewst-gewinn')).textContent).toBe('50.200,00 €')
    expect(screen.getByText('Hebesatz von dir eingetragen.')).toBeTruthy()
    expect(screen.getByTestId('gewst-fehlbetrag-rest')).toBeTruthy()
    expect(screen.queryByTestId('gewst-fehlbetrag')).toBeNull()
  })
})

describe('Verluste', () => {
  const LOSSES = (newLossEur = 0) => ({ facts: {}, rules: {}, businessProfitEur: -100, year: { newLossEur, carryForwardDeductedEur: 0, remainingCarryForwardEur: 0 }, carryBack: null })
  const useLosses = (newLossEur = 0, profile = BASE_PROFILE) => {
    useBusinessDefaults(profile)
    server.use(http.get(`${BASE_URL}/verluste`, () => HttpResponse.json(LOSSES(newLossEur))))
  }

  it('retries a failed first read', async () => {
    useBusinessDefaults()
    failOnce(`${BASE_URL}/verluste`, LOSSES())
    renderBusiness('verluste')
    await retryThenFind('verluste-seite')
  })

  it('records the carried-forward loss, a second year\'s room and the carry-back, each key on its own', async () => {
    useLosses(0, { ...BASE_PROFILE, lossFacts: { roomEur: [10, 20], carriedForwardEur: 5, carriedBackEur: 3 } })
    const puts = recordPuts()
    renderBusiness('verluste')
    const carried = await screen.findByTestId('verluste-vortrag')
    expect((carried as HTMLInputElement).value).toBe('5')
    fireEvent.blur(carried)
    fireEvent.change(carried, { target: { value: '1500,5' } })
    fireEvent.blur(carried)
    const second = screen.getByTestId('verluste-platz-1')
    fireEvent.change(second, { target: { value: '300' } })
    fireEvent.blur(second)
    const back = screen.getByTestId('verluste-zurueckgetragen')
    fireEvent.change(back, { target: { value: '' } })
    fireEvent.blur(back)
    await waitFor(() => expect(puts).toHaveLength(3))
    // WEB-30: only the changed key goes out; the API merges lossFacts key by key.
    expect(puts[0]).toEqual({ lossFacts: { carriedForwardEur: 1500.5 } })
    expect(puts[1]).toEqual({ lossFacts: { roomEur: [10, 300] } })
    expect(puts[2]).toEqual({ lossFacts: { carriedBackEur: 0 } })
  })

  it('sends an emptied carry-forward as 0 and ignores what is no number', async () => {
    useLosses()
    const puts = recordPuts()
    renderBusiness('verluste')
    const carried = await screen.findByTestId('verluste-vortrag')
    fireEvent.change(carried, { target: { value: 'viel' } })
    fireEvent.blur(carried)
    const room = screen.getByTestId('verluste-platz-0')
    fireEvent.change(room, { target: { value: 'x' } })
    fireEvent.blur(room)
    const back = screen.getByTestId('verluste-zurueckgetragen')
    fireEvent.change(back, { target: { value: 'x' } })
    fireEvent.blur(back)
    fireEvent.change(carried, { target: { value: ' ' } })
    fireEvent.blur(carried)
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ lossFacts: { carriedForwardEur: 0 } })
  })

  it('takes the carry-back again after a waiver, and shows a refusal', async () => {
    useLosses(500, { ...BASE_PROFILE, lossFacts: { waiveCarryBack: true } })
    recordPuts(409)
    renderBusiness('verluste')
    fireEvent.click(await screen.findByTestId('verluste-ruecktrag-ja'))
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
  })
})

describe('the export', () => {
  const useDocs = (missing: string[], note = 'Noch nicht übermittelt.') =>
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '<x/>', transmitted: false, note })),
    )

  it('says the procedure documentation is loading, and keeps the E-Bilanz download off until the data set is there', async () => {
    server.use(http.get(`${BASE_URL}/verfahrensdokumentation`, async () => delay('infinite')), http.get(`${BASE_URL}/e-bilanz`, async () => delay('infinite')))
    renderBusiness('export')
    expect(await screen.findByText('Lade …')).toBeTruthy()
    expect(screen.getByTestId('ebilanz-datei').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByTestId('verfahren-speichern')).toBeNull()
  })

  it('calls the documentation complete when nothing is missing', async () => {
    useDocs([])
    renderBusiness('export')
    expect(await screen.findByTestId('verfahren-vollstaendig')).toBeTruthy()
  })

  it('saves only the placeholders that were filled in, and an unknown placeholder shows under its key', async () => {
    useDocs(['inhaber', 'unbekannt_x'])
    const bodies: unknown[] = []
    server.use(http.put(`${BASE_URL}/verfahrensdokumentation`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ values: {}, text: '', missing: [] }) }))
    renderBusiness('export')
    fireEvent.change(await screen.findByTestId('verfahren-inhaber'), { target: { value: 'Nora Muster' } })
    fireEvent.change(screen.getByTestId('verfahren-unbekannt_x'), { target: { value: '  ' } })
    expect(screen.getByText('unbekannt_x')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verfahren-speichern'))
    await waitFor(() => expect(bodies).toEqual([{ values: { inhaber: 'Nora Muster' } }]))
  })

  it('shows the refusal of saving the documentation', async () => {
    useDocs(['inhaber'])
    server.use(http.put(`${BASE_URL}/verfahrensdokumentation`, () => refusal(409, 'Die Dokumentation ist gesperrt.')))
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('verfahren-speichern'))
    expect(await screen.findByText('Die Dokumentation ist gesperrt.')).toBeTruthy()
  })

  it('downloads the E-Bilanz data set, and leads from a 402 to the unlock', async () => {
    useDocs([])
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let status = 200
    server.use(http.get(`${BASE_URL}/e-bilanz/datei`, () => (status === 200 ? new HttpResponse(new Blob(['<x/>']), { status: 200 }) : refusal(402, 'Nicht freigeschaltet.'))))
    const onOpenPage = vi.fn()
    renderBusiness('export', { onOpenPage })
    await screen.findByTestId('verfahren-vollstaendig')
    await waitFor(() => expect(screen.getByTestId('ebilanz-datei').getAttribute('aria-disabled')).not.toBe('true'))
    fireEvent.click(screen.getByTestId('ebilanz-datei'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    status = 402
    fireEvent.click(screen.getByTestId('ebilanz-datei'))
    fireEvent.click(await screen.findByTestId('export-freischalten'))
    expect(onOpenPage).toHaveBeenCalledWith('freischalten')
  })

  it('shows any other refusal of a download in the shared wording (WEB-44)', async () => {
    useDocs([])
    server.use(http.get(`${BASE_URL}/export/gobd`, () => refusal(500, 'Der Export ist ausgefallen.')))
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('gobd-export'))
    expect(await screen.findByTestId('business-speichern-fehler')).toBeTruthy()
    expect(screen.getByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
  })
})

describe('the checkout', () => {
  function renderCheckout(openCheckout: (url: string) => void) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrap = (node: ReactNode) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={createAppI18n('de')}>
          <ThemeProvider mode="light">{node}</ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
    return render(wrap(<CheckoutPage taxYear={YEAR} person="A" onBack={() => {}} onOpenPage={() => {}} openCheckout={openCheckout} />))
  }

  it('hands the checkout address of the API to the browser', async () => {
    server.use(http.post(`${BASE_URL}/checkout`, () => HttpResponse.json({ checkoutUrl: 'https://pay.example/session/1' }, { status: 201 })))
    const open = vi.fn()
    renderCheckout(open)
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://pay.example/session/1'))
  })

  it('links terms and privacy policy before the payment (WEB-7)', async () => {
    renderCheckout(vi.fn())
    await screen.findByTestId('checkout-selbststaendig')
    expect(screen.getByTestId('rechtliches-link-agb').getAttribute('href')).toBe('/rechtliches/agb')
    expect(screen.getByTestId('beta-hinweis')).toBeTruthy()
  })

  it('shows the refusal of the API when it is no unconfigured tier', async () => {
    server.use(http.post(`${BASE_URL}/checkout`, () => refusal(409, 'Das Jahr ist schon freigeschaltet.')))
    const open = vi.fn()
    renderCheckout(open)
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    expect(await screen.findByText('Das Jahr ist schon freigeschaltet.')).toBeTruthy()
    expect(screen.queryByTestId('checkout-nicht-eingerichtet')).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('names a tier that is not set up by its code as well as by a 503', async () => {
    server.use(http.post(`${BASE_URL}/checkout`, () => refusal(400, 'x', 'PAYMENT_TIER_NOT_CONFIGURED')))
    renderCheckout(vi.fn())
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    expect(await screen.findByTestId('checkout-nicht-eingerichtet')).toBeTruthy()
  })

  it('leaves the page for the checkout through the browser by default', async () => {
    let asked = false
    server.use(http.post(`${BASE_URL}/checkout`, () => { asked = true; return HttpResponse.json({ checkoutUrl: '#bezahlt' }, { status: 201 }) }))
    renderBusiness('freischalten')
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    await waitFor(() => expect(asked).toBe(true))
    expect(screen.queryByTestId('business-speichern-fehler')).toBeNull()
  })
})

describe('the profession questions', () => {
  it('retries a failed first read', async () => {
    useCatalogues()
    failOnce(BASE_URL, BASE_PROFILE)
    renderBusiness('beruf')
    await retryThenFind('beruf-seite')
  })

  it('saves what the tax office said, the similar profession and the free activity, and clears a choice', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, professionAnswers: { priorAssessment: 'gewerbe', catalogProfession: 'architekt' } })
    useCatalogues()
    const puts = recordPuts()
    renderBusiness('beruf')
    fireEvent.click(await screen.findByTestId('beruf-bisher-keine'))
    fireEvent.click(screen.getByTestId('beruf-aehnlich-nein'))
    fireEvent.change(screen.getByTestId('beruf-taetigkeit'), { target: { value: 'kuenstlerisch' } })
    await screen.findByText('Architekt/in')
    fireEvent.change(screen.getByTestId('beruf-katalog'), { target: { value: '' } })
    await waitFor(() => expect(puts).toHaveLength(4))
    expect(puts[0]).toEqual({ professionAnswers: { priorAssessment: null, catalogProfession: 'architekt' } })
    expect(puts[1]).toEqual({ professionAnswers: { priorAssessment: 'gewerbe', catalogProfession: 'architekt', similarToCatalogProfession: false } })
    expect(puts[2]).toEqual({ professionAnswers: { priorAssessment: 'gewerbe', catalogProfession: 'architekt', freeActivity: 'kuenstlerisch' } })
    expect(puts[3]).toEqual({ professionAnswers: { priorAssessment: 'gewerbe', catalogProfession: null } })
  })

  it('shows a refused save and works while the catalogues cannot be read', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/kataloge`, () => refusal(500, 'x')))
    recordPuts(409)
    renderBusiness('beruf')
    fireEvent.click(await screen.findByTestId('beruf-aehnlich-ja'))
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
  })

  it('shows the chosen entries as text where there is no select', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, professionAnswers: { catalogProfession: 'arzt' } })
    useCatalogues()
    const original = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    try {
      renderBusiness('beruf')
      expect(await screen.findByText('Ärztin/Arzt')).toBeTruthy()
      expect(screen.getByText('Keine')).toBeTruthy()
      expect(screen.queryByTestId('beruf-katalog')).toBeNull()
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true })
    }
    expect(CATALOGUES.professions).toHaveLength(2)
  })
})

describe('the partnership shares', () => {
  it('retries a failed first read', async () => {
    failOnce(BASE_URL, BASE_PROFILE)
    renderBusiness('beteiligungen')
    await retryThenFind('beteiligungen-seite')
  })

  it('says there are none yet, and refuses a share without a name or a profit, or with an unreadable amount', async () => {
    useBusinessDefaults()
    const puts = recordPuts()
    renderBusiness('beteiligungen')
    expect(await screen.findByTestId('beteiligungen-leer')).toBeTruthy()
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    expect(await screen.findByText('Bitte Name und Gewinnanteil angeben.')).toBeTruthy()
    fireEvent.change(screen.getByTestId('beteiligung-name'), { target: { value: 'Alt GbR' } })
    fireEvent.change(screen.getByTestId('beteiligung-gewinn'), { target: { value: '8000' } })
    fireEvent.click(screen.getByTestId('beteiligung-art-gewerbe'))
    fireEvent.change(screen.getByTestId('beteiligung-messbetrag'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    fireEvent.change(screen.getByTestId('beteiligung-messbetrag'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('beteiligung-gewerbesteuer'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    expect(screen.getByText('Bitte Name und Gewinnanteil angeben.')).toBeTruthy()
    expect(puts).toHaveLength(0)
  })

  it('adds a trade-tax share with its tax, shows a loss signed, and removes a share', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, partnershipShares: [{ name: 'Alt GbR', kind: 'gewerbe', profitEur: -1500 }, { name: 'Zweite', kind: 'freiberuf', profitEur: 100 }] })
    const puts = recordPuts()
    renderBusiness('beteiligungen')
    const row = await screen.findByTestId('beteiligung-0')
    expect(row.textContent).toContain('Alt GbR · Gewerbe')
    expect(row.textContent).toContain('−1.500,00')
    fireEvent.click(screen.getByTestId('beteiligung-entfernen-0'))
    confirmAction('shareRemove')
    fireEvent.change(screen.getByTestId('beteiligung-name'), { target: { value: 'Neu OHG' } })
    fireEvent.change(screen.getByTestId('beteiligung-gewinn'), { target: { value: '8000,5' } })
    fireEvent.click(screen.getByTestId('beteiligung-art-gewerbe'))
    fireEvent.change(screen.getByTestId('beteiligung-gewerbesteuer'), { target: { value: '90' } })
    // NC-15: while the removal is on its way the list is not built on again from its stale state.
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    await waitFor(() => expect(screen.getByTestId('beteiligung-hinzufuegen').getAttribute('aria-disabled')).not.toBe('true'))
    expect(puts).toHaveLength(1)
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[0]).toEqual({ partnershipShares: [{ name: 'Zweite', kind: 'freiberuf', profitEur: 100 }] })
    expect((puts[1] as { partnershipShares: unknown[] }).partnershipShares.at(-1)).toEqual({ name: 'Neu OHG', kind: 'gewerbe', profitEur: 8000.5, tradeTaxEur: 90 })
  })

  it('keeps the form when the API refuses the save, and says why', async () => {
    useBusinessDefaults()
    recordPuts(409)
    renderBusiness('beteiligungen')
    fireEvent.change(await screen.findByTestId('beteiligung-name'), { target: { value: 'Neu' } })
    fireEvent.change(screen.getByTestId('beteiligung-gewinn'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
    expect((screen.getByTestId('beteiligung-name') as HTMLInputElement).value).toBe('Neu')
  })
})

describe('the trade-tax inputs', () => {
  it('retries a failed first read', async () => {
    failOnce(BASE_URL, BASE_PROFILE)
    renderBusiness('gewerbedaten')
    await retryThenFind('gewerbedaten-seite')
  })

  it('drops an emptied field, reads a German decimal, says it is saved, and shows a refusal', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, tradeTaxInputs: { einheitswertEur: 50000, otherAdditionsEur: 10 } })
    const puts = recordPuts()
    renderBusiness('gewerbedaten')
    fireEvent.change(await screen.findByTestId('gewerbedaten-einheitswertEur'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('gewerbedaten-otherDeductionsEur'), { target: { value: '12,5' } })
    fireEvent.click(screen.getByTestId('gewerbedaten-speichern'))
    expect(await screen.findByTestId('gewerbedaten-gespeichert')).toBeTruthy()
    // Only what changed goes out: the emptied field as null (removes it), the new one; the API merges.
    expect(puts[0]).toEqual({ tradeTaxInputs: { einheitswertEur: null, otherDeductionsEur: 12.5 } })
    recordPuts(409)
    fireEvent.click(screen.getByTestId('gewerbedaten-speichern'))
    expect(await screen.findByText('Das Profil ist gesperrt.')).toBeTruthy()
  })

  it('refuses a negative amount in the other additions', async () => {
    useBusinessDefaults()
    renderBusiness('gewerbedaten')
    fireEvent.change(await screen.findByTestId('gewerbedaten-lossCarriedForwardEur'), { target: { value: '-3' } })
    fireEvent.click(screen.getByTestId('gewerbedaten-speichern'))
    expect(await screen.findByText('Mindestens ein Betrag ist keine Zahl.')).toBeTruthy()
  })
})
