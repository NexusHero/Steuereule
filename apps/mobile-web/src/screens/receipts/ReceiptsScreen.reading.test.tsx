// The Belege tab reading a stored original again, leading to the drafts, and answering "Für wen?"
// with "that is me" or by creating the person the document names (ADR-0092, ADR-0097).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { Text } from 'react-native'
import { createAppI18n } from '../../i18n/app-i18n'
import { ReceiptsScreen } from './ReceiptsScreen'
import { server } from '../../test-msw-server'
import { ShellStateProvider, useShellState } from '../../navigation/ShellState'
import type { AssignmentQuestionDto, ReceiptResponseDto } from '@steuereule/api-client'
import { receiptInboxHandler, receiptPage } from '../../test-receipt-inbox'

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/documentOcr')>()), extractDocumentTextOnDevice: mockExtract }))

const RECEIPTS_URL = '*/v1/belege'

function receipt(over: Partial<ReceiptResponseDto> = {}): ReceiptResponseDto {
  return {
    id: 'b1',
    fileName: 'spende.pdf',
    kind: 'Sonstiges',
    belegdatum: null,
    zahlungsdatum: null,
    hasFile: true,
    holders: [],
    holderTaxYear: null,
    processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
    filledFields: [],
    duplicateOf: null,
    mimeType: 'application/pdf',
    byteLength: 100,
    assignment: { kind: 'ungebunden' },
    ...over,
  } as ReceiptResponseDto
}

function parseResponse(extra: object = {}) {
  return { mode: 'deterministic_fallback', securityBlocked: false, parsed: {}, stagedAction: null, assistantMessage: null, draftsTaxYear: null, filedInTaxYear: null, noValuesReason: null, duplicateOf: null, processing: null, ...extra }
}

function YearProbe() {
  return <Text testID="shell-year">{String(useShellState().taxYear)}</Text>
}

function renderReceipts(shell = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = (
    <ThemeProvider mode="light">
      <ReceiptsScreen />
    </ThemeProvider>
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        {shell ? (
          <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
            <YearProbe />
            {content}
          </ShellStateProvider>
        ) : (
          content
        )}
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockExtract.mockReset()
  mockExtract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung 50 EUR', usedOcrFallback: false, pagesProcessed: 1 })
})

describe('reading a stored Beleg again', () => {
  it('fetches the stored original and reads it on the device, then asks the server about it', async () => {
    const parseBodies: unknown[] = []
    server.use(
      receiptInboxHandler([receipt()]),
      http.get('*/v1/belege/b1/datei', () => new HttpResponse('%PDF-1.4', { headers: { 'content-type': 'application/pdf' } })),
      http.post('*/v1/belege/parse', async ({ request }) => {
        parseBodies.push(await request.json())
        return HttpResponse.json(parseResponse())
      }),
    )
    renderReceipts()

    fireEvent.click(await screen.findByTestId('receipt-eule-b1'))

    await waitFor(() => expect(parseBodies).toHaveLength(1))
    expect(parseBodies[0]).toMatchObject({ receiptId: 'b1', rawText: 'Spendenbescheinigung 50 EUR' })
    expect(mockExtract).toHaveBeenCalledOnce()
  })

  it('says the original could not be read when it is gone', async () => {
    server.use(
      receiptInboxHandler([receipt()]),
      http.get('*/v1/belege/b1/datei', () => HttpResponse.json({ message: 'gone' }, { status: 404 })),
    )
    renderReceipts()

    fireEvent.click(await screen.findByTestId('receipt-eule-b1'))

    expect(await screen.findByTestId('receipt-eule-fehler-b1')).toBeTruthy()
    expect(mockExtract).not.toHaveBeenCalled()
  })
})

describe('leading to the drafts', () => {
  it('switches to the year of the drafts when the user opens them', async () => {
    server.use(
      http.get(RECEIPTS_URL, () =>
        HttpResponse.json(receiptPage([receipt({ hasFile: false, processing: { state: 'vorschlaege', reason: null, pending: 1, applied: 0, dismissed: 0, draftsTaxYear: 2020, open: true } })])),
      ),
    )
    renderReceipts(true)

    fireEvent.click(await screen.findByTestId('receipt-b1-zu-vorschlaegen'))

    await waitFor(() => expect(screen.getByTestId('shell-year').textContent).toBe('2020'))
  })

  it('opens the drafts of the open year without changing it', async () => {
    server.use(
      http.get(RECEIPTS_URL, () =>
        HttpResponse.json(receiptPage([receipt({ hasFile: false, processing: { state: 'vorschlaege', reason: null, pending: 1, applied: 0, dismissed: 0, draftsTaxYear: null, open: true } })])),
      ),
    )
    renderReceipts(true)
    const shownBefore = (await screen.findByTestId('shell-year')).textContent
    fireEvent.click(await screen.findByTestId('receipt-b1-zu-vorschlaegen'))
    expect(screen.getByTestId('shell-year').textContent).toBe(shownBefore)
  })
})

describe('"Für wen?" on a Beleg card', () => {
  const upload = (question: AssignmentQuestionDto, onParse: (body: { holder?: string }) => void) => {
    let list: ReceiptResponseDto[] = []
    server.use(
      receiptInboxHandler(() => list),
      http.post('*/v1/belege/upload', () => {
        list = [receipt()]
        return HttpResponse.json(receipt(), { status: 201 })
      }),
      http.post('*/v1/belege/parse', async ({ request }) => {
        const body = (await request.json()) as { holder?: string }
        onParse(body)
        return HttpResponse.json(parseResponse(body.holder === undefined ? { assignment: { holder: null, question, alsoFor: [] } } : { assignment: { holder: { holder: body.holder, name: null }, question: null, alsoFor: [] } }))
      }),
    )
  }
  const pick = () => fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [new File(['%PDF-1.4'], 'spende.pdf', { type: 'application/pdf' })] } })

  it('takes "that is me" and reads again for the user', async () => {
    const holders: (string | undefined)[] = []
    mockExtract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung Nora Sommer 50 EUR', usedOcrFallback: false, pagesProcessed: 1 })
    upload({ reason: 'confirmSelf', options: [{ holder: 'A', name: null }], preselected: 'A', printedName: 'Nora Sommer', area: null, offerCreate: [] }, (b) => holders.push(b.holder))
    server.use(http.get('*/v1/profile', () => HttpResponse.json({ firstName: 'Nora', lastName: 'Sommer', steuerId: null, steuernummer: null })), http.put('*/v1/profile', () => HttpResponse.json({}, { status: 200 })))
    renderReceipts()
    await screen.findByText('Noch keine Belege.')
    pick()

    fireEvent.click(await screen.findByTestId('beleg-zuordnung-bin-ich'))

    await waitFor(() => expect(holders).toEqual([undefined, 'A']))
  })

  it('creates Person B from the document and reads the Beleg again for them', async () => {
    const holders: (string | undefined)[] = []
    mockExtract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung Jonas Weber 50 EUR', usedOcrFallback: false, pagesProcessed: 1 })
    upload({ reason: 'unknown', options: [{ holder: 'A', name: 'Elias' }], preselected: null, printedName: 'Jonas Weber', area: null, offerCreate: ['B'] }, (b) => holders.push(b.holder))
    server.use(
      http.put('*/v1/steuerjahre/*/kopplung', () => HttpResponse.json({ filingType: 'zusammen', personBHasOwnAccount: false })),
      http.put('*/v1/steuerjahre/*/kopplung/person-b', () => HttpResponse.json({ filingType: 'zusammen', personBHasOwnAccount: false })),
    )
    renderReceipts()
    await screen.findByText('Noch keine Belege.')
    pick()

    fireEvent.click(await screen.findByTestId('beleg-zuordnung-anlegen-b'))
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-vorname'), { target: { value: 'Jonas' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-nachname'), { target: { value: 'Weber' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-geburtsdatum'), { target: { value: '01.02.1990' } })
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-speichern'))

    await waitFor(() => expect(holders).toEqual([undefined, 'B']))
  })
})
