// The small, pure and hook-level pieces of the self-employed area: the answer helpers, the file download,
// the CSV mapping builder and the capability read.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { Answers } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { downloadBusinessFile } from './businessDownload'
import { ApiError, NetworkError } from '@steuereule/api-client'
import { eurosToCents, germanDay, localProblem, numberAt, personParams, plainEuro, problemOf, problemText, recordAt, signedCents, signedEuro, stringAt, todayIso } from './businessKit'
import { buildMapping, EMPTY_MAPPING, MappingForm, type MappingState } from './BankMapping'
import { attempt, queryProblem } from './useBusiness'
import { declaresSelfEmployment, useSelfEmploymentCapability } from './useSelfEmployment'

afterEach(() => vi.restoreAllMocks())

describe('the figures and answers of the area', () => {
  it('writes a result with its sign, and a plain amount without', () => {
    expect(signedCents(123450)).toBe('+1.234,50 €')
    expect(signedCents(-8000)).toBe('−80,00 €')
    expect(signedCents(0)).toBe('0,00 €')
    expect(signedEuro(-12.5)).toBe('−12,50 €')
    expect(plainEuro(80)).toBe('80,00 €')
  })

  it('reads German and plain euro entries into cents, and refuses what is no amount', () => {
    expect(eurosToCents('1.234,50')).toBe(123450)
    expect(eurosToCents(' 12,5 ')).toBe(1250)
    expect(eurosToCents('80')).toBe(8000)
    expect(eurosToCents('')).toBeNull()
    expect(eurosToCents('zwölf')).toBeNull()
    expect(eurosToCents('1,234')).toBeNull()
  })

  it('asks the API for person B only, and keeps what is not a date as it is', () => {
    expect(personParams('A')).toBeUndefined()
    expect(personParams('B')).toEqual({ person: 'B' })
    expect(germanDay('2025-09-20')).toBe('20.09.2025')
    expect(germanDay('bald')).toBe('bald')
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reads the status and code of a rejection, and keeps only a domain reason of the API (a string with a code)', () => {
    const t = createAppI18n('de').t as unknown as (key: string, options?: Record<string, unknown>) => string
    expect(problemOf(new ApiError(409, { code: 'BOOK_INTEGRITY_BROKEN', message: 'Kette gebrochen.' }))).toMatchObject({ status: 409, code: 'BOOK_INTEGRITY_BROKEN', local: null })
    expect(problemText(problemOf(new ApiError(400, { message: ['Eins.', 'Zwei.'] })), t)).toBe(t('apiFehler.validation'))
    expect(problemText(problemOf(new ApiError(500, null)), t)).toBe(t('apiFehler.server'))
    expect(problemText(problemOf(new ApiError(409, { code: 'X', message: '  ' })), t)).toBe(t('apiFehler.conflict'))
    expect(problemOf(undefined)).toEqual({ error: undefined, status: undefined, code: null, local: null })
  })

  it('finds numbers, records and strings inside an untyped answer, and null where they are not', () => {
    const body = { a: { b: { c: 7 } }, list: [1], name: 'x', inf: Infinity }
    expect(numberAt(body, 'a.b.c')).toBe(7)
    expect(numberAt(body, 'a.x.c')).toBeNull()
    expect(numberAt(body, 'name')).toBeNull()
    expect(numberAt(body, 'inf')).toBeNull()
    expect(numberAt(null, 'a')).toBeNull()
    expect(recordAt(body, 'a')).toEqual({ b: { c: 7 } })
    expect(recordAt(body, 'list')).toBeNull()
    expect(recordAt(body, 'name')).toBeNull()
    expect(recordAt('text', 'a')).toBeNull()
    expect(stringAt(body, 'name')).toBe('x')
    expect(stringAt(body, 'a')).toBeNull()
    expect(stringAt(undefined, 'name')).toBeNull()
  })
})

describe('the first read and the writes', () => {
  const t = createAppI18n('de').t as unknown as (key: string, options?: Record<string, unknown>) => string

  it('calls a failed read a problem with its rejection, and a read that is fine none', () => {
    const error = new ApiError(403, { code: 'X', message: 'Gesperrt.' })
    expect(queryProblem({ isError: true, error })).toEqual({ error, status: 403, code: 'X', local: null })
    expect(queryProblem({ isError: false })).toBeNull()
  })

  it('runs a write: ok when it resolves, the rejection as the problem when it fails', async () => {
    expect(await attempt(async () => ({ status: 201, data: 1 }))).toEqual({ ok: true, response: { status: 201, data: 1 } })
    const refused = new ApiError(409, { code: 'BOOK_FRAME_FIXED', message: 'Fest.' })
    expect(await attempt(async () => Promise.reject(refused))).toEqual({ ok: false, problem: { error: refused, status: 409, code: 'BOOK_FRAME_FIXED', local: null } })
    const offline = new NetworkError()
    expect(await attempt(async () => Promise.reject(offline))).toEqual({ ok: false, problem: { error: offline, status: undefined, code: null, local: null } })
  })

  it('says a domain refusal by the API\'s German reason, and everything else in the shared wording (WEB-44)', () => {
    expect(problemText(problemOf(new ApiError(409, { code: 'BOOK_FRAME_FIXED', message: 'Fest.' })), t)).toBe('Fest.')
    expect(problemText(problemOf(new ApiError(400, { code: 'PAYROLL_MONTH', message: 'Der Monat ist 1 bis 12.' })), t)).toBe('Der Monat ist 1 bis 12.')
    // Never the raw English server text.
    expect(problemText(problemOf(new ApiError(500, { statusCode: 500, message: 'Internal server error' })), t)).toBe(t('apiFehler.server'))
    expect(problemText(problemOf(new ApiError(401, { code: 'ACCOUNT_REQUIRED', message: 'This endpoint requires a signed-in account, not a guest session.' })), t)).toBe(t('apiFehler.accountRequired'))
    expect(problemText(problemOf(new ApiError(429, { code: 'RATE_LIMITED', message: 'Too many' })), t)).toBe(t('apiFehler.rateLimited'))
    // A DTO 400 carries no code: the shared validation line.
    expect(problemText(problemOf(new ApiError(400, { statusCode: 400, message: ['name must be a string'] })), t)).toBe(t('apiFehler.validation'))
    expect(problemText(problemOf(new NetworkError()), t)).toBe(t('apiFehler.offline'))
    expect(problemText(localProblem('Mindestens ein Betrag ist keine Zahl.'), t)).toBe('Mindestens ein Betrag ist keine Zahl.')
  })
})

describe('downloading a file of the API', () => {
  const URL_PATH = '/v1/steuerjahre/2025/selbststaendig/export/gobd'
  it('names the file as the API says, and falls back to its own name without a header', async () => {
    const create = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
    server.use(http.get(`*${URL_PATH}`, () => new HttpResponse(new Blob(['z']), { status: 200, headers: { 'content-disposition': 'attachment; filename="gobd-2025.zip"' } })))
    expect(await downloadBusinessFile(URL_PATH, 'fallback.zip')).toEqual({ ok: true })
    server.use(http.get(`*${URL_PATH}`, () => new HttpResponse(new Blob(['z']), { status: 200 })))
    expect(await downloadBusinessFile(URL_PATH, 'fallback.zip')).toEqual({ ok: true })
    expect(clicked).toEqual(['gobd-2025.zip', 'fallback.zip'])
  })

  it('keeps the reason of a refusal, also when the body is no JSON, and reports a network failure', async () => {
    server.use(http.get(`*${URL_PATH}`, () => HttpResponse.json({ statusCode: 409, code: 'BOOK_INTEGRITY_BROKEN', message: 'Kette gebrochen.' }, { status: 409 })))
    const t = createAppI18n('de').t as unknown as (key: string, options?: Record<string, unknown>) => string
    const refused = await downloadBusinessFile(URL_PATH, 'f.zip')
    expect(refused).toMatchObject({ ok: false, problem: { status: 409, code: 'BOOK_INTEGRITY_BROKEN' } })
    if (!refused.ok) expect(problemText(refused.problem, t)).toBe('Kette gebrochen.')
    server.use(http.get(`*${URL_PATH}`, () => new HttpResponse('not json', { status: 503 })))
    const down = await downloadBusinessFile(URL_PATH, 'f.zip')
    expect(down).toMatchObject({ ok: false, problem: { status: 503, code: null } })
    if (!down.ok) expect(problemText(down.problem, t)).toBe(t('apiFehler.server'))
    server.use(http.get(`*${URL_PATH}`, () => HttpResponse.error()))
    const offline = await downloadBusinessFile(URL_PATH, 'f.zip')
    expect(offline).toMatchObject({ ok: false, problem: { status: undefined, code: null } })
    if (!offline.ok) expect(problemText(offline.problem, t)).toBe(t('apiFehler.offline'))
  })
})

describe('the CSV mapping of an unknown bank', () => {
  const filled: MappingState = { ...EMPTY_MAPPING, bookingDate: 'Buchungstag', amount: '4', reference: 'Zweck, 7' }

  it('builds the mapping with named and counted columns, and leaves the optional ones out', () => {
    expect(buildMapping(filled)).toEqual({ delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YYYY', bookingDate: { name: 'Buchungstag' }, reference: [{ name: 'Zweck' }, { index: 7 }], amount: { index: 4 } })
  })

  it('takes debit and credit columns when the amount is split, with the counterparty and IBAN', () => {
    const split = buildMapping({ ...filled, split: true, debit: 'Soll', credit: 'Haben', counterparty: 'Name', iban: '9' })
    expect(split).toMatchObject({ debit: { name: 'Soll' }, credit: { name: 'Haben' }, counterpartyName: { name: 'Name' }, counterpartyIban: { index: 9 } })
    expect(split).not.toHaveProperty('amount')
  })

  it('is not complete without a booking date, a reference or the amount columns', () => {
    expect(buildMapping({ ...filled, bookingDate: ' ' })).toBeNull()
    expect(buildMapping({ ...filled, reference: ' , ' })).toBeNull()
    expect(buildMapping({ ...filled, amount: '' })).toBeNull()
    expect(buildMapping({ ...filled, split: true, debit: 'Soll' })).toBeNull()
    expect(buildMapping({ ...filled, split: true, credit: 'Haben' })).toBeNull()
  })

  function renderForm(state: MappingState) {
    const onChange = vi.fn()
    render(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MappingForm state={state} onChange={onChange} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    return onChange
  }

  it('changes delimiter, decimal sign, date format and the amount layout, each in one press', () => {
    const onChange = renderForm(EMPTY_MAPPING)
    fireEvent.click(screen.getByTestId('bank-map-trenner-tab'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, delimiter: '\t' })
    fireEvent.click(screen.getByTestId('bank-map-trenner-komma'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, delimiter: ',' })
    fireEvent.click(screen.getByTestId('bank-map-dezimal-punkt'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, decimal: '.' })
    fireEvent.click(screen.getByTestId('bank-map-datum-YYYY-MM-DD'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, dateFormat: 'YYYY-MM-DD' })
    fireEvent.click(screen.getByTestId('bank-map-betrag-zwei'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, split: true })
    fireEvent.change(screen.getByTestId('bank-map-bookingDate'), { target: { value: 'Tag' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, bookingDate: 'Tag' })
  })

  it('asks for the debit and credit columns instead of the amount when split, and back', () => {
    const onChange = renderForm({ ...EMPTY_MAPPING, split: true })
    expect(screen.getByTestId('bank-map-debit')).toBeTruthy()
    expect(screen.getByTestId('bank-map-credit')).toBeTruthy()
    expect(screen.queryByTestId('bank-map-amount')).toBeNull()
    fireEvent.click(screen.getByTestId('bank-map-betrag-eine'))
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_MAPPING, split: false })
  })
})

describe('the self-employment switch of the server', () => {
  it('counts „Selbstständig“ and „Beides“ as declaring it, nothing else', () => {
    expect(declaresSelfEmployment({ job: 'Selbstständig' } as Answers)).toBe(true)
    expect(declaresSelfEmployment({ job: 'Beides' } as Answers)).toBe(true)
    expect(declaresSelfEmployment({ job: 'Angestellt' } as Answers)).toBe(false)
  })

  function Probe({ client }: { client: QueryClient }) {
    return (
      <QueryClientProvider client={client}>
        <Capability />
      </QueryClientProvider>
    )
  }
  function Capability() {
    const c = useSelfEmploymentCapability()
    return <span data-testid="cap">{c.pending ? 'pending' : c.enabled ? 'on' : 'off'}</span>
  }
  const capabilities = (body: unknown, status = 200) => server.use(http.get('*/v1/capabilities', () => HttpResponse.json(body as object, { status })))
  const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('is on when the server says so, pending until it answered', async () => {
    capabilities({ selbststaendig: true })
    render(<Probe client={freshClient()} />)
    expect(screen.getByTestId('cap').textContent).toBe('pending')
    await waitFor(() => expect(screen.getByTestId('cap').textContent).toBe('on'))
  })

  it('is on for a new user whose year has no cockpit summary yet (09b in CI, 21.11.2026)', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/cockpit', () => HttpResponse.json(null)))
    capabilities({ selbststaendig: true })
    render(<Probe client={freshClient()} />)
    await waitFor(() => expect(screen.getByTestId('cap').textContent).toBe('on'))
  })

  it('is off when the read answers with an error', async () => {
    capabilities({ statusCode: 500, message: 'x' }, 500)
    render(<Probe client={freshClient()} />)
    await waitFor(() => expect(screen.getByTestId('cap').textContent).toBe('off'))
  })

  it('reads the switch from the cache at once when it is already there', async () => {
    const client = freshClient()
    const { getCapabilitiesControllerGetCapabilitiesQueryKey } = await import('@steuereule/api-client')
    client.setQueryData(getCapabilitiesControllerGetCapabilitiesQueryKey(), { status: 200, data: { selbststaendig: true } })
    render(<Probe client={client} />)
    expect(screen.getByTestId('cap').textContent).toBe('on')
    await act(async () => {})
  })
})
