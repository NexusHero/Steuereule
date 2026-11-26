// WEB-38 / NC-04: the final bookkeeping actions ask first and say they are final. Nothing is sent before the
// confirmation, „Abbrechen“ sends nothing, and the confirmation sends exactly one request.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { BookDto, JournalEntryDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { BASE_URL, EMPTY_BOOK, renderBusiness, useBusinessDefaults, BASE_PROFILE } from './businessTestKit'
import { DESTRUCTIVE_ACTIONS, type DestructiveActionId } from '../../confirm/destructiveActions'

const ENTRY: JournalEntryDto = {
  number: 3,
  date: '2025-03-01',
  documentNumber: 'RE-3',
  receiptRef: null,
  text: 'Bürobedarf',
  lines: [
    { account: '4930', side: 'debit', amount: 10000, taxKey: 'none', taxPart: null },
    { account: '1200', side: 'credit', amount: 10000, taxKey: 'none', taxPart: null },
  ],
  reversalOf: null,
  reversedBy: null,
}
const BOOK: BookDto = { ...EMPTY_BOOK, entries: [ENTRY] }
const BILANZ = { mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: 250000 }, balanceSheet: { totalAktiva: 900000, totalPassiva: 900000 } } }
const REGISTER = { register: { rows: [] }, records: [] }
const REGISTER_WITH_ASSET = { register: { rows: [{ id: 'a1', label: 'Laptop', acquisitionCost: 120000, closingBookValue: 80000 }], totals: {} }, records: [] }

interface Case {
  readonly name: string
  readonly id: DestructiveActionId
  readonly page: string
  readonly path: string
  readonly prepare?: () => void
  readonly press: () => Promise<unknown>
}

const CASES: readonly Case[] = [
  {
    name: 'Storno',
    id: 'bookingReverse',
    page: 'buch',
    path: '/buchungen/3/storno',
    prepare: () => useBusinessDefaults(BASE_PROFILE, BOOK),
    press: async () => fireEvent.click(await screen.findByTestId('buch-storno-3')),
  },
  {
    name: 'Festschreiben',
    id: 'bookLock',
    page: 'buch',
    path: '/festschreibung',
    prepare: () => useBusinessDefaults(BASE_PROFILE, BOOK),
    press: async () => {
      const date = (await screen.findByTestId('buch-fest-datum')) as HTMLInputElement
      fireEvent.change(date, { target: { value: '30.06.2025' } })
      fireEvent.click(screen.getByTestId('buch-festschreiben'))
    },
  },
  {
    name: 'Abgang buchen',
    id: 'assetDispose',
    page: 'anlagen',
    path: '/anlagen/a1/abgang',
    prepare: () => {
      useBusinessDefaults()
      server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER_WITH_ASSET)))
    },
    press: async () => {
      fireEvent.click(await screen.findByTestId('anlage-abgang-a1'))
      fireEvent.change(screen.getByTestId('anlage-abgang-datum'), { target: { value: '30.06.2025' } })
      fireEvent.click(screen.getByTestId('anlage-abgang-buchen'))
    },
  },
  {
    name: 'AfA buchen',
    id: 'depreciationBook',
    page: 'anlagen',
    path: '/anlagen/abschreibung',
    prepare: () => {
      useBusinessDefaults()
      server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    },
    press: async () => fireEvent.click(await screen.findByTestId('anlage-afa-buchen')),
  },
  {
    name: 'Eröffnungsbilanz übertragen',
    id: 'openingBalance',
    page: 'abschluss',
    path: '/abschluss/eroeffnung',
    prepare: () => {
      useBusinessDefaults()
      server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json(BILANZ)))
    },
    press: async () => fireEvent.click(await screen.findByTestId('abschluss-eroeffnung')),
  },
  {
    name: 'An ELSTER übermitteln',
    id: 'eBilanzSend',
    page: 'export',
    path: '/e-bilanz/uebermittlung',
    prepare: () => {
      useBusinessDefaults()
      server.use(
        http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: [] })),
        http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '<x/>', transmitted: false, transmissionReady: true, note: null })),
      )
    },
    press: async () => fireEvent.click(await screen.findByTestId('ebilanz-senden')),
  },
]

function countPosts(path: string): { readonly calls: () => number } {
  let calls = 0
  server.use(
    http.post(`${BASE_URL}${path}`, () => {
      calls += 1
      return HttpResponse.json({ status: 'ok', mode: 'senden', ticket: 'T', protocol: null, ...ENTRY }, { status: 201 })
    }),
  )
  return { calls: () => calls }
}

it('every final action of the registry has a case here', () => {
  const finals = (Object.keys(DESTRUCTIVE_ACTIONS) as DestructiveActionId[]).filter((id) => DESTRUCTIVE_ACTIONS[id].tone === 'final')
  expect(finals.filter((id) => !CASES.some((c) => c.id === id))).toEqual([])
})

describe.each(CASES)('$name (WEB-38)', ({ id, page, path, prepare, press }) => {
  it('asks first and says it is final; „Abbrechen“ sends nothing', async () => {
    prepare?.()
    const posts = countPosts(path)
    renderBusiness(page)
    await press()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByTestId(`rueckfrage-${id}-body`).textContent).toMatch(/endgültig/)
    expect(posts.calls()).toBe(0)
    fireEvent.click(screen.getByTestId(`rueckfrage-${id}-cancel`))
    expect(screen.queryByTestId(`rueckfrage-${id}`)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(posts.calls()).toBe(0)
  })

  it('sends exactly one request after the confirmation, even on a double tap', async () => {
    prepare?.()
    const posts = countPosts(path)
    renderBusiness(page)
    await press()
    const confirm = screen.getByTestId(`rueckfrage-${id}-confirm`)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(posts.calls()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(posts.calls()).toBe(1)
  })
})
