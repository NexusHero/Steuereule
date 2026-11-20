// Shared by the tests of the self-employed area: the render frame and honest default answers (contract-typed).
import type { ReactNode } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { BookDto, BusinessProfileDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { BusinessScreen } from './BusinessScreen'

export const YEAR = 2025
export const BASE_URL = `*/v1/steuerjahre/${YEAR}/selbststaendig`

export const BASE_PROFILE: BusinessProfileDto = {
  person: 'A',
  confirmedKind: null,
  professionAnswers: null,
  suggestion: null,
  name: null,
  mode: 'euer',
  chart: 'SKR03',
  smallBusiness: false,
  vatMethod: 'ist',
  municipalityAgs: null,
  multiplierOverride: null,
  startDate: null,
  vatPrepaymentsCents: null,
  tradeTaxInputs: {},
  lossFacts: {},
  partnershipShares: [],
  bookExists: false,
}

export const EMPTY_BOOK: BookDto = { chart: 'SKR03', mode: 'euer', lockedThrough: null, integrity: { ok: true }, entries: [] }

/** The routes the overview reads, with honest defaults; a test overrides what it is about. */
export function useBusinessDefaults(profile: BusinessProfileDto = BASE_PROFILE, book: BookDto = EMPTY_BOOK) {
  server.use(
    http.get(BASE_URL, () => HttpResponse.json(profile)),
    http.get(`${BASE_URL}/buch`, () => HttpResponse.json(book)),
    http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])),
    http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: { totals: { einnahmen: 0, ausgaben: 0 }, profit: { profitEur: 0 } }, bilanz: null })),
  )
}

export function renderBusiness(
  page: string | undefined,
  handlers: { onOpenPage?: (p: string | undefined) => void; onBack?: () => void; onChangePerson?: (p: 'A' | 'B') => void; payment?: string } = {},
): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">{node}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
  return render(
    wrap(
      <BusinessScreen
        taxYear={YEAR}
        person="A"
        page={page}
        payment={handlers.payment}
        onBack={handlers.onBack ?? (() => {})}
        onOpenPage={handlers.onOpenPage ?? (() => {})}
        {...(handlers.onChangePerson ? { onChangePerson: handlers.onChangePerson } : {})}
      />,
    ),
  )
}

export const CATALOGUES = {
  professions: [{ key: 'architekt', label: 'Architekt/in' }, { key: 'arzt', label: 'Ärztin/Arzt' }],
  freeActivities: [{ key: 'kuenstlerisch', label: 'künstlerisch' }],
  assetCategories: [{ key: 'computer', label: 'Computer', years: 1, source: 'AfA-Tabelle AV' }, { key: 'car', label: 'Pkw', years: 6, source: 'AfA-Tabelle AV' }],
  bankPresets: ['sparkasse', 'ing', 'dkb', 'commerzbank'],
}
export function useCatalogues() {
  server.use(http.get(`${BASE_URL}/kataloge`, () => HttpResponse.json(CATALOGUES)))
}
