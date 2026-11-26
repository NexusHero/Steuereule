// „2020 oder früher ergänzen“ — the way into the Belege pipeline from the Verlauf: what is refused,
// what the reading found on the Bescheid, and the way on to the waiting drafts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { AssessmentUploadEntry, type AssessmentUploadEntryProps } from './AssessmentUploadEntry'
import { renderWithQuery } from '../../../test/test-render'

const { extract } = vi.hoisted(() => ({ extract: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: extract }
})

function parseBody(notice: object | null) {
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: 2026 },
    stagedAction: null,
    assistantMessage: null,
    draftsTaxYear: 2020,
    filedInTaxYear: 2020,
    noValuesReason: null,
    duplicateOf: null,
    ...(notice ? { assessmentNotice: notice } : {}),
    processing: { state: 'vorschlaege', reason: null, pending: 4, applied: 0, dismissed: 0, draftsTaxYear: 2020, open: true },
  }
}

function setup(props: Partial<AssessmentUploadEntryProps> = {}) {
  renderWithQuery(<AssessmentUploadEntry openYear={2026} title="2020 oder früher ergänzen" body="Lade einen alten Bescheid hoch." cta="Bescheid hochladen" testID="upload" {...props} />)
}

function choose(file: File) {
  fireEvent.change(screen.getByTestId('upload-datei'), { target: { files: [file] } })
}
const pdf = () => new File(['%PDF-1.4'], 'bescheid.pdf', { type: 'application/pdf' })

afterEach(() => server.resetHandlers())

describe('AssessmentUploadEntry', () => {
  it('shows its title, text and the button', () => {
    setup()
    expect(screen.getByText('2020 oder früher ergänzen')).toBeTruthy()
    expect(screen.getByText('Lade einen alten Bescheid hoch.')).toBeTruthy()
    expect(screen.getByTestId('upload-cta').textContent).toBe('Bescheid hochladen')
  })

  it('refuses a file type it cannot read', async () => {
    setup()
    choose(new File(['x'], 'notiz.txt', { type: 'text/plain' }))
    expect((await screen.findByTestId('upload-fehler')).textContent).toBe('Bitte wähle eine PDF-, JPEG-, PNG- oder WebP-Datei aus.')
  })

  it('says so when the document could not be stored — a 500 is our fault, not the connection (WEB-10)', async () => {
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ message: 'no' }, { status: 500 })))
    setup()
    choose(pdf())
    expect((await screen.findByTestId('upload-fehler')).textContent).toBe('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')
    expect(screen.getByTestId('upload-cta').textContent).toBe('Bescheid hochladen')
  })

  it('names the 10 MB limit on a 413 (WEB-10)', async () => {
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ statusCode: 413 }, { status: 413 })))
    setup()
    choose(pdf())
    expect((await screen.findByTestId('upload-fehler')).textContent).toBe('Die Datei ist zu groß. Erlaubt sind höchstens 10 MB.')
  })

  it('names what the reading found on the Bescheid and leads to the waiting drafts', async () => {
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-1' }, { status: 201 })),
      http.post('*/v1/belege/parse', () =>
        HttpResponse.json(
          parseBody({ taxYearOnDocument: 2020, assessmentDate: '2021-09-02', read: ['einnahmen', 'werbungskosten'], notRead: ['sonderausgaben'], explanations: 3, createsEckjahr: true, stagedActionIds: ['a', 'b', 'c', 'd'] }),
        ),
      ),
    )
    extract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Einkommensteuerbescheid 2020', usedOcrFallback: false, pagesProcessed: 1 })
    const onOpenDrafts = vi.fn()
    setup({ onOpenDrafts })
    choose(pdf())

    const result = await screen.findByTestId('upload-bescheid')
    expect(result.textContent).toContain('2020')
    expect(result.textContent).toContain('02.09.2021')
    expect(screen.getByTestId('upload-nicht-gelesen')).toBeTruthy()
    expect(screen.getByTestId('upload-eckjahr').textContent).toContain('2020')
    fireEvent.click(screen.getByTestId('upload-vorschlaege'))
    expect(onOpenDrafts).toHaveBeenCalledOnce()
  })

  it('says that no year was found, and shows no date, no Eckjahr and no unread positions', async () => {
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-2' }, { status: 201 })),
      http.post('*/v1/belege/parse', () => HttpResponse.json(parseBody({ taxYearOnDocument: null, assessmentDate: null, read: [], notRead: [], explanations: 0, createsEckjahr: true, stagedActionIds: [] }))),
    )
    extract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Bescheid', usedOcrFallback: false, pagesProcessed: 1 })
    setup()
    choose(pdf())

    const result = await screen.findByTestId('upload-bescheid')
    expect(result.textContent).not.toContain('2020')
    expect(screen.queryByTestId('upload-nicht-gelesen')).toBeNull()
    expect(screen.queryByTestId('upload-eckjahr')).toBeNull()
    expect(screen.queryByTestId('upload-vorschlaege')).toBeNull()
  })

  it('shows the plain status of the reading when no Bescheid was recognised', async () => {
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-3' }, { status: 201 })),
      http.post('*/v1/belege/parse', () => HttpResponse.json(parseBody(null))),
    )
    extract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnsteuerbescheinigung', usedOcrFallback: false, pagesProcessed: 1 })
    setup({ document: 'lstb' })
    choose(pdf())

    const result = await screen.findByTestId('upload-ergebnis')
    expect(screen.queryByTestId('upload-bescheid')).toBeNull()
    expect(result.textContent).toContain('4')
  })

  it('says that the document is being read while it is', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-4' }, { status: 201 })),
      http.post('*/v1/belege/parse', async () => {
        await held
        return HttpResponse.json(parseBody(null))
      }),
    )
    extract.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Bescheid', usedOcrFallback: false, pagesProcessed: 1 })
    setup()
    choose(pdf())
    await waitFor(() => expect(screen.getByTestId('upload-cta').textContent).toBe('Wird verschlüsselt hochgeladen …'))
    release()
    expect(await screen.findByTestId('upload-ergebnis')).toBeTruthy()
  })
})
