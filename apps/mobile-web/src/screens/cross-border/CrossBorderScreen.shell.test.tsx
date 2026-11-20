// Grenzgänger — after the Lohnausweis upload, inside the app shell: the button label while the
// document is read, the way to the waiting drafts and the switch to the tax year they sit in.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { CrossBorderScreen } from './CrossBorderScreen'
import { EMPTY_CH_SALARY_CERTIFICATE_RESPONSE, server } from '../../test-msw-server'

const { switchToTab, setTaxYear, extract } = vi.hoisted(() => ({ switchToTab: vi.fn(), setTaxYear: vi.fn(), extract: vi.fn() }))
vi.mock('../../navigation/ShellState', () => ({
  useOptionalSwitchToTab: () => switchToTab,
  useOptionalSetTaxYear: () => setTaxYear,
}))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: extract }
})

const TAX_YEAR = 2026

function parseBody(draftsTaxYear: number) {
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: TAX_YEAR },
    stagedAction: null,
    assistantMessage: null,
    draftsTaxYear,
    filedInTaxYear: draftsTaxYear,
    noValuesReason: null,
    duplicateOf: null,
    processing: { state: 'vorschlaege', reason: null, pending: 3, applied: 0, dismissed: 0, draftsTaxYear, open: true },
  }
}

function setup(parse: () => Promise<Response> | Response) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () => HttpResponse.json({ answers: { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '10' }, nextStep: { kind: 'done' }, openItems: 0 })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`, () => HttpResponse.json(EMPTY_CH_SALARY_CERTIFICATE_RESPONSE)),
    http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-1' }, { status: 201 })),
    http.post('*/v1/belege/parse', parse),
  )
  extract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnausweis - Certificat de salaire', usedOcrFallback: false, pagesProcessed: 1 })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CrossBorderScreen onDone={() => {}} taxYear={TAX_YEAR} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function upload() {
  const input = (await screen.findByTestId('ch-lohnausweis-upload-card')).querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'lohnausweis.pdf', { type: 'application/pdf' })] } })
}

afterEach(() => {
  server.resetHandlers()
  switchToTab.mockClear()
  setTaxYear.mockClear()
})

describe('Grenzgänger — upload inside the app shell', () => {
  it('leads to the waiting drafts in the owl tab', async () => {
    setup(() => HttpResponse.json(parseBody(TAX_YEAR)))
    await upload()
    fireEvent.click(await screen.findByTestId('ch-lohnausweis-ergebnis-zu-vorschlaegen'))
    expect(switchToTab).toHaveBeenCalledWith('Owl')
  })

  it('offers to switch to the tax year the certificate belongs to', async () => {
    setup(() => HttpResponse.json(parseBody(2025)))
    await upload()
    fireEvent.click(await screen.findByTestId('ch-lohnausweis-ergebnis-jahr-wechseln'))
    expect(setTaxYear).toHaveBeenCalledWith(2025)
  })

  it('says that the document is being read while the server still works on it', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    setup(async () => {
      await held
      return HttpResponse.json(parseBody(TAX_YEAR))
    })
    await upload()
    await waitFor(() => expect(screen.getByTestId('ch-lohnausweis-upload-btn').textContent).toMatch(/Wird (gelesen|verschlüsselt hochgeladen)/))
    release()
    expect(await screen.findByTestId('ch-lohnausweis-ergebnis-stand')).toBeTruthy()
    expect(screen.getByTestId('ch-lohnausweis-upload-btn').textContent).toBe('Lohnausweis auswählen')
  })
})
