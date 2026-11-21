// ADR-0097 §3 — a chat upload of several files ends with one line per file, from the server's state, and
// no line is lost when the next file is read (real-data run 18.11.2026: only the last file said anything).
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ParseReceiptResponseDto, ReceiptResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CopilotBridgeProvider, useCopilotBridge, type CopilotMode } from './CopilotBridgeProvider'
import { ChatReceiptResults } from './ChatReceiptResults'

const { mockExtractDocumentText } = vi.hoisted(() => ({ mockExtractDocumentText: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: mockExtractDocumentText }
})

type Processing = NonNullable<ParseReceiptResponseDto['processing']>
const processing = (p: Partial<Processing>): Processing => ({ state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true, ...p })

/** What the server answers for each file of the batch. */
const BY_FILE: Readonly<Record<string, Partial<ParseReceiptResponseDto>>> = {
  'spende-2024.pdf': { draftsTaxYear: 2024, filedInTaxYear: 2024, processing: processing({ state: 'vorschlaege', pending: 1, draftsTaxYear: 2024 }) },
  'waage-2025.pdf': { noValuesReason: 'nicht_absetzbar', processing: processing({ state: 'nichts_verwertbar', reason: 'nicht_absetzbar', open: false }) },
  'handwerker-2025.pdf': { processing: processing({ state: 'nichts_verwertbar', reason: 'nichts_erkannt', open: false }) },
  'kaputt.pdf': { processing: processing({ state: 'nicht_lesbar', reason: 'unlesbar' }) },
}

function parseResponse(fileName: string): ParseReceiptResponseDto {
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: 2025 },
    stagedAction: null,
    assistantMessage: null,
    draftsTaxYear: null,
    filedInTaxYear: null,
    noValuesReason: null,
    duplicateOf: null,
    ...BY_FILE[fileName],
  }
}

function Probe({ files }: { readonly files: readonly File[] }) {
  const bridge = useCopilotBridge()
  return (
    <div>
      <button
        onClick={() => {
          bridge.startReceiptBatch()
          void (async () => {
            for (const file of files) await bridge.captureReceiptFile(file)
          })()
        }}
      >
        upload-batch
      </button>
      <ChatReceiptResults results={bridge.receiptResults} openYear={bridge.taxYear} onSwitchYear={bridge.switchTaxYear} onClose={bridge.clearReceiptResults} />
    </div>
  )
}

function Harness({ files, onSwitchYear }: { readonly files: readonly File[]; readonly onSwitchYear: (year: number) => void }) {
  const [mode, setMode] = useState<CopilotMode>('eulen-modus')
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CopilotBridgeProvider mode={mode} onModeChange={setMode} taxYear={2025} isAuthenticated onSwitchYear={onSwitchYear}>
            <Probe files={files} />
          </CopilotBridgeProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('chat batch upload (ADR-0097 §3)', () => {
  it('keeps one line per file from the server state, records what the device could not read, and switches to the year of a draft', async () => {
    const parseBodies: { fileName: string; receiptId?: string; deviceReadFailure?: string; inChat?: boolean }[] = []
    let uploads = 0
    mockExtractDocumentText.mockReset()
    mockExtractDocumentText.mockImplementation(async (file: File) => {
      if (file.name === 'kaputt.pdf') throw new Error('Invalid PDF structure')
      return { kind: 'pdf', mimeType: 'application/pdf', text: `Text von ${file.name}`, usedOcrFallback: false, pagesProcessed: 1 }
    })
    server.use(
      // The files are uploaded one after another, in the order they were picked.
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: `id-${uploads++}` } as Partial<ReceiptResponseDto>, { status: 201 })),
      http.post('*/v1/belege/parse', async ({ request }) => {
        const body = (await request.json()) as { fileName: string; receiptId?: string; deviceReadFailure?: string; inChat?: boolean }
        parseBodies.push(body)
        return HttpResponse.json(parseResponse(body.fileName), { status: 200 })
      }),
    )
    const files = Object.keys(BY_FILE).map((name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' }))
    const onSwitchYear = vi.fn()
    render(<Harness files={files} onSwitchYear={onSwitchYear} />)

    fireEvent.click(screen.getByText('upload-batch'))

    await waitFor(() => expect(screen.getByTestId('advisor-receipt-result-3-stand')).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByTestId('advisor-receipt-result-0-stand').textContent).toBe('spende-2024.pdf: 1 Wert wartet auf dich')
    expect(screen.getByTestId('advisor-receipt-result-0-jahr').textContent).toBe('Liegt im Steuerjahr 2024')
    expect(screen.getByTestId('advisor-receipt-result-1-stand').textContent).toBe('waage-2025.pdf: Nichts für die Erklärung: nicht absetzbar')
    expect(screen.getByTestId('advisor-receipt-result-2-stand').textContent).toBe('handwerker-2025.pdf: Nichts erkannt')
    expect(screen.getByTestId('advisor-receipt-result-3-stand').textContent).toBe('kaputt.pdf: Nicht lesbar (Datei nicht lesbar)')
    // The unreadable file sent no text, only the failure, so its Beleg does not stay „neu“.
    expect(parseBodies.find((b) => b.fileName === 'kaputt.pdf')).toMatchObject({ receiptId: 'id-3', deviceReadFailure: 'read_failed' })
    // Uploaded in the chat of a year: the Beleg is filed in that year, also when it yields nothing (real-data run 4).
    expect(parseBodies.find((b) => b.fileName === 'handwerker-2025.pdf')).toMatchObject({ inChat: true })

    fireEvent.click(screen.getByTestId('advisor-receipt-result-0-jahr-wechseln'))
    expect(onSwitchYear).toHaveBeenCalledWith(2024)

    fireEvent.click(screen.getByTestId('advisor-receipt-results-close'))
    expect(screen.queryByTestId('advisor-receipt-results')).toBeNull()
  })
})
