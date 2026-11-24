// useAcroFieldSaver — every editable Vordruck field goes back through the endpoint of its mask,
// only HTTP 200 counts as stored, and a field with nothing safe to write to is refused.
import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { MasterDataResponseDto } from '@steuereule/api-client'
import { server } from '../../test-msw-server'
import { useAcroFieldSaver } from './useAcroFieldSaver'
import { SINGLE_COPY } from './acroFieldEditing'

const YEAR = 2025
const MASTER_DATA = {
  geburtsdatum: '1990-05-12',
  strasse: 'Rheinweg',
  hausnummer: '4',
  hausnummerZusatz: null,
  plz: '79539',
  wohnort: 'Lörrach',
  beruf: 'Ingenieurin',
  religion: null,
  familienstand: 'ledig',
  familienstandSeit: null,
  iban: null,
  kontoinhaber: null,
  finanzamt: 'Lörrach',
  telefon: null,
  missing: [],
} as unknown as MasterDataResponseDto

function setup(masterData: MasterDataResponseDto | null = MASTER_DATA) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(() => useAcroFieldSaver({ year: YEAR, masterData }), { wrapper }).result.current
}

/** Records the body and the query string of every PUT/POST to a URL, and answers with `status`. */
function record(method: 'put' | 'post', url: string, status = 200) {
  const calls: Array<{ body: unknown; search: string }> = []
  server.use(
    http[method](url, async ({ request }) => {
      calls.push({ body: await request.json(), search: new URL(request.url).search })
      return HttpResponse.json({}, { status })
    }),
  )
  return calls
}

afterEach(() => server.resetHandlers())

describe('useAcroFieldSaver — amounts', () => {
  it('writes the Bruttoarbeitslohn through the Lohnsteuer mask as whole euros', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/lstb/:feld`)
    const outcome = await setup()('anlN.kz110', '68.500', SINGLE_COPY)
    expect(outcome).toEqual({ kind: 'saved' })
    expect(calls).toEqual([{ body: { kind: 'erfasst', value: 68500 }, search: '' }])
  })

  it('writes for Person B with the person parameter', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/lstb/:feld`)
    await setup()('anlN.kz110', '1000', { person: 'B', entityId: null, copies: 2 })
    expect(calls[0]?.search).toBe('?person=B')
  })

  it('writes a CHF amount through the Lohnausweis mask', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/ch-lohnausweis/:feld`)
    expect(await setup()('anlNGre.z6Chf', '84000', SINGLE_COPY)).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual({ kind: 'erfasst', value: 84000 })
  })

  it('writes the capital income through the Kapital mask', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/kapital/:feld`)
    expect(await setup()('anlKap.kz210', '900', SINGLE_COPY)).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual({ kind: 'erfasst', value: 900 })
  })

  it('writes a pension through the Rente mask and clears it again with an empty entry', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/rente/:feld`)
    const save = setup()
    expect(await save('anlR.kz101', '12000', SINGLE_COPY)).toEqual({ kind: 'saved' })
    expect(await save('anlR.kz101', '', SINGLE_COPY)).toEqual({ kind: 'cleared' })
    expect(calls.map((c) => c.body)).toEqual([{ kind: 'erfasst', value: 12000 }, { kind: 'offen' }])
  })

  it('refuses an ambiguous amount without calling the server', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/lstb/:feld`)
    expect(await setup()('anlN.kz110', '68,5', SINGLE_COPY)).toEqual({ kind: 'invalid', reason: 'amount' })
    expect(calls).toEqual([])
  })

  it('reports a refusal of the server as failed', async () => {
    record('put', `*/v1/steuerjahre/${YEAR}/lstb/:feld`, 422)
    expect(await setup()('anlN.kz110', '1000', SINGLE_COPY)).toMatchObject({ kind: 'failed', error: { status: 422 } })
  })

  it('reports an unreachable server as failed', async () => {
    server.use(http.put(`*/v1/steuerjahre/${YEAR}/lstb/:feld`, () => HttpResponse.error()))
    expect(await setup()('anlN.kz110', '1000', SINGLE_COPY)).toMatchObject({ kind: 'failed' })
  })
})

describe('useAcroFieldSaver — text', () => {
  it('saves a master-data field as part of the whole record', async () => {
    const calls = record('put', '*/v1/stammdaten')
    expect(await setup()('est1a.wohnort', 'Freiburg', SINGLE_COPY)).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual(expect.objectContaining({ wohnort: 'Freiburg', strasse: 'Rheinweg', finanzamt: 'Lörrach' }))
  })

  it('refuses a master-data field while the master data is not loaded', async () => {
    const calls = record('put', '*/v1/stammdaten')
    expect(await setup(null)('est1a.wohnort', 'Freiburg', SINGLE_COPY)).toEqual({ kind: 'not-editable' })
    expect(calls).toEqual([])
  })

  it('saves a field of Person B', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/kopplung/person-b`)
    expect(await setup()('est1a.vornameB', 'Markus', SINGLE_COPY)).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual({ firstName: 'Markus' })
  })

  it('saves the name of the child of the copy, and refuses to empty it', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/kinder/:id`)
    const save = setup()
    const copy = { person: 'A', entityId: 'k1', copies: 2 } as const
    expect(await save('anlKind.vorname', 'Lina', copy)).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual({ firstName: 'Lina' })
    expect(await save('anlKind.vorname', '  ', copy)).toEqual({ kind: 'invalid', reason: 'required' })
  })

  it('saves the address of the rental object of the copy', async () => {
    const calls = record('put', `*/v1/steuerjahre/${YEAR}/vermietung/objekte/:id/adresse`)
    expect(await setup()('anlV.ort', 'Basel', { person: 'A', entityId: 'obj-1', copies: 1 })).toEqual({ kind: 'saved' })
    expect(calls[0]?.body).toEqual({ city: 'Basel' })
  })

  it('refuses a postal code that is not five digits and a Steuer-ID that is not valid', async () => {
    const save = setup()
    expect(await save('est1a.plz', '123', SINGLE_COPY)).toEqual({ kind: 'invalid', reason: 'postalCode' })
    expect(await save('est1a.idnrB', '123', SINGLE_COPY)).toEqual({ kind: 'invalid', reason: 'taxId' })
  })

  it('says a child or rental field without a record behind it cannot be edited', async () => {
    const save = setup()
    expect(await save('anlKind.vorname', 'Lina', SINGLE_COPY)).toEqual({ kind: 'not-editable' })
    expect(await save('anlV.ort', 'Basel', SINGLE_COPY)).toEqual({ kind: 'not-editable' })
  })

  it('says a computed field and an unknown field cannot be edited', async () => {
    const save = setup()
    expect(await save('anlN.kz320', '10', SINGLE_COPY)).toEqual({ kind: 'not-editable' })
    expect(await save('est1a.religion', 'RK', SINGLE_COPY)).toEqual({ kind: 'not-editable' })
  })
})
