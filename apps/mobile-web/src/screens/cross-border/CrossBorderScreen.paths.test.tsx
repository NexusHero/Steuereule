// Grenzgänger — the paths the main test file leaves out: load failure, a refused interview
// answer, leaving the interview, the partner's way back, the live Bruttolohn sum, the missing
// fields drawer, the N-Gre details, the Wechselkurs validation and the failing upload.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { InterviewStateDto, ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { CrossBorderScreen } from './CrossBorderScreen'
import { EMPTY_CH_SALARY_CERTIFICATE_RESPONSE, server } from '../../../test/test-msw-server'
import { renderWithQuery } from '../../../test/test-render'

const { mockExtractDocumentText } = vi.hoisted(() => ({ mockExtractDocumentText: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: mockExtractDocumentText }
})

const TAX_YEAR = 2026
const INTERVIEW_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview`
const POST_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`
const CH_URL = `*/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`
const EMPTY_CH = EMPTY_CH_SALARY_CERTIFICATE_RESPONSE

const EMPTY_INTERVIEW: InterviewStateDto = { answers: {}, nextStep: { kind: 'question', id: 'ch-wohnsitz' }, openItems: 2 }
const DONE_INTERVIEW: InterviewStateDto = { answers: { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '10' }, nextStep: { kind: 'done' }, openItems: 0 }

function renderScreen(props: { onDone?: () => void; onBack?: () => void; partnerName?: string } = {}) {
  return renderWithQuery(<CrossBorderScreen onDone={props.onDone ?? (() => {})} taxYear={TAX_YEAR} {...(props.onBack ? { onBack: props.onBack } : {})} {...(props.partnerName ? { partnerName: props.partnerName } : {})} />)
}

function openMask(certificate: ChSalaryCertificateResponseDto = EMPTY_CH) {
  server.use(
    http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_INTERVIEW, { status: 200 })),
    http.get(CH_URL, () => HttpResponse.json(certificate, { status: 200 })),
  )
}

function recordPuts(path: string) {
  const bodies: unknown[] = []
  server.use(
    http.put(`${CH_URL}/${path}`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(EMPTY_CH, { status: 200 })
    }),
  )
  return bodies
}

beforeEach(() => {
  server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(EMPTY_INTERVIEW, { status: 200 })), http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
})
afterEach(() => server.resetHandlers())

describe('Grenzgänger — load failure and the interview', () => {
  it('says that loading failed and loads again on retry', async () => {
    let calls = 0
    server.use(
      http.get(INTERVIEW_URL, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(EMPTY_INTERVIEW, { status: 200 })
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('Noch mal versuchen'))
    expect(await screen.findByText(/Wo wohnst/)).toBeTruthy()
  })

  it('takes a Swiss residence answer and goes back out of the interview', async () => {
    const posted: unknown[] = []
    server.use(
      http.post(POST_URL, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 1 }, { status: 200 })
      }),
    )
    const onBack = vi.fn()
    renderScreen({ onBack })
    fireEvent.click(await screen.findByTestId('ch-wohnsitz-schweiz'))
    await waitFor(() => expect(posted).toEqual([{ questionId: 'ch-wohnsitz', value: 'Schweiz' }]))
    await screen.findByText(/zurückgekehrt/)
    fireEvent.click(screen.getByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
  })

  it('leaves through onDone when no back handler is given', async () => {
    const onDone = vi.fn()
    renderScreen({ onDone })
    fireEvent.click(await screen.findByLabelText('Zurück'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('submits the days with Enter only when they are a valid number of days', async () => {
    const posted: unknown[] = []
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json({ answers: { 'ch-wohnsitz': 'Deutschland' }, nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 1 }, { status: 200 })),
      http.post(POST_URL, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
      }),
    )
    renderScreen()
    const input = await screen.findByTestId('ch-tage-input')
    fireEvent.change(input, { target: { value: '400' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 30))
    expect(posted).toEqual([])
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(posted).toEqual([{ questionId: 'ch-nichtrueckkehrtage', value: '12' }]))
  })

  it('takes a refused answer back and asks the server for the true state', async () => {
    let interviewReads = 0
    server.use(
      http.get(INTERVIEW_URL, () => {
        interviewReads += 1
        return HttpResponse.json(EMPTY_INTERVIEW, { status: 200 })
      }),
      http.post(POST_URL, () => HttpResponse.json({ code: 'ANSWER_UNREACHABLE' }, { status: 409 })),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('Deutschland'))
    await waitFor(() => expect(interviewReads).toBeGreaterThanOrEqual(2))
    expect(await screen.findByText(/Wo wohnst/)).toBeTruthy()
  })

  it('takes an answer back when the request never arrives', async () => {
    server.use(http.post(POST_URL, () => HttpResponse.error()))
    renderScreen()
    fireEvent.click(await screen.findByText('Deutschland'))
    await waitFor(() => expect(screen.getByText(/Wo wohnst/)).toBeTruthy())
  })
})

describe('Grenzgänger — the partner’s interview', () => {
  it('lets the partner step back from the days question to the residence question', async () => {
    renderScreen({ partnerName: 'Nora' })
    fireEvent.click(await screen.findByText('Schweiz'))
    await screen.findByText(/zurückgekehrt/)
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(await screen.findByText('Schweiz')).toBeTruthy()
    expect(screen.getByTestId('ch-interview-titel').textContent).toBe('Wo wohnt Nora?')
  })

  it('saves a Swiss residence of the partner with the days', async () => {
    const facts = recordPuts('grenzgaenger')
    renderScreen({ partnerName: 'Nora' })
    fireEvent.click(await screen.findByText('Schweiz'))
    fireEvent.change(await screen.findByTestId('ch-tage-input'), { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('ch-tage-weiter'))
    await waitFor(() => expect(facts).toEqual([{ residence: 'Schweiz', daysWithoutReturn: 3 }]))
  })
})

describe('Grenzgänger — the Lohnausweis mask', () => {
  it('opens the list of missing fields and names each of them', async () => {
    openMask()
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-offene-pflichtfelder-toggle'))
    expect(screen.getByTestId('ch-offen-chip-bruttolohn-total')).toBeTruthy()
    expect(screen.getByTestId('ch-offen-chip-berufliche-vorsorge')).toBeTruthy()
    expect(screen.getByTestId('ch-offen-chip-wechselkurs')).toBeTruthy()
    fireEvent.click(screen.getByTestId('ch-offene-pflichtfelder-toggle'))
    expect(screen.queryByTestId('ch-offen-chip-bruttolohn-total')).toBeNull()
  })

  it('offers to take over the live sum into Ziffer 8 once the user overrode it, and saves it', async () => {
    openMask()
    const bodies: Array<{ feld: string; body: unknown }> = []
    server.use(
      http.put(`${CH_URL}/:feld`, async ({ request, params }) => {
        bodies.push({ feld: String(params.feld), body: await request.json() })
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('ch-feld-bruttolohn-total'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('ch-feld-lohn'), { target: { value: '5000' } })
    fireEvent.change(screen.getByTestId('ch-feld-sitzungsgelder'), { target: { value: '200' } })
    expect((await screen.findByTestId('ch-bruttolohn-summe-banner')).textContent).toContain('5.200 CHF')

    fireEvent.click(screen.getByTestId('ch-bruttolohn-summe-uebernehmen'))

    await waitFor(() => expect(bodies).toContainEqual({ feld: 'bruttolohn-total', body: { kind: 'erfasst', value: 5200 } }))
    expect((screen.getByTestId('ch-feld-bruttolohn-total') as HTMLInputElement).value).toBe('5200')
    expect(screen.queryByTestId('ch-bruttolohn-summe-uebernehmen')).toBeNull()
  })

  it('clears a Ziffer with an empty entry and ignores an unreadable one', async () => {
    openMask({ ...EMPTY_CH, fields: EMPTY_CH.fields.map((f) => (f.id === 'lohn' ? { ...f, kind: 'erfasst' as const, value: 4000 } : f)) })
    const bodies: unknown[] = []
    server.use(
      http.put(`${CH_URL}/:feld`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const lohn = await screen.findByTestId('ch-feld-lohn')
    expect((lohn as HTMLInputElement).value).toBe('4000')
    fireEvent.change(lohn, { target: { value: 'viel' } })
    fireEvent.blur(lohn)
    await new Promise((r) => setTimeout(r, 40))
    expect(bodies).toEqual([])
    fireEvent.change(lohn, { target: { value: '' } })
    fireEvent.blur(lohn)
    await waitFor(() => expect(bodies).toEqual([{ kind: 'offen' }]))
  })

  it('does not ask for the Quellensteuer of somebody who is no Grenzgänger, and says so', async () => {
    openMask({ ...EMPTY_CH, status: 'kein-grenzgaenger' })
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-offene-pflichtfelder-toggle'))
    expect(screen.queryByTestId('ch-offen-chip-quellensteuer')).toBeNull()
    expect(screen.queryByTestId('ch-pflicht-quellensteuer')).toBeNull()
    expect(screen.getByText(/Kein Grenzgänger/i)).toBeTruthy()
  })

  it('shows how many entries are still open in the fold', async () => {
    openMask({ ...EMPTY_CH, foldStatus: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 3 } as never })
    renderScreen()
    expect(await screen.findByText('Noch 3 Pflichtfeld(er) offen')).toBeTruthy()
  })

  it('goes back and on from the mask', async () => {
    openMask()
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderScreen({ onBack, onDone })
    fireEvent.click(await screen.findByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('ch-lohnausweis-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('rejects a Wechselkurs of zero and an unknown month, and keeps the typed month after a failed try', async () => {
    openMask()
    const bodies = recordPuts('wechselkurs')
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-wechselkurs-monat-03'))
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('ch-wechselkurs-speichern'))
    expect(await screen.findByText('Bitte Monat oder Jahresdurchschnitt wählen und Kurs eintragen, z. B. 1,07.')).toBeTruthy()
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '0,95' } })
    fireEvent.click(screen.getByTestId('ch-wechselkurs-speichern'))
    await waitFor(() => expect(bodies).toEqual([{ month: '2026-03', rate: 0.95, mode: 'amtlich' }]))
    expect(screen.queryByText('Bitte Monat oder Jahresdurchschnitt wählen und Kurs eintragen, z. B. 1,07.')).toBeNull()
  })
})

describe('Grenzgänger — Anlage N-Gre details', () => {
  it('saves the yes/no answers and the Sonderfälle', async () => {
    openMask()
    const bodies = recordPuts('n-gre')
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-ngre-familienzulagen-im-brutto-ja'))
    fireEvent.click(screen.getByTestId('ch-ngre-kv-zuschuss-nein'))
    fireEvent.click(screen.getByTestId('ch-ngre-sonderfaelle-ja'))
    await waitFor(() => expect(bodies).toEqual([{ familienzulagenImBruttolohn: true }, { kvZuschussAnspruch: false }, { specialCases: true }]))
  })

  it('saves the employer percentage, clears an amount and refuses an invalid percentage', async () => {
    openMask()
    const bodies = recordPuts('n-gre')
    renderScreen()
    const percent = await screen.findByTestId('ch-ngre-krankentaggeldArbeitgeberProzent')
    fireEvent.change(percent, { target: { value: '150' } })
    fireEvent.blur(percent)
    await new Promise((r) => setTimeout(r, 40))
    expect(bodies).toEqual([])
    fireEvent.change(percent, { target: { value: '50' } })
    fireEvent.blur(percent)
    await waitFor(() => expect(bodies).toEqual([{ krankentaggeldArbeitgeberProzent: 50 }]))

    const nbuv = screen.getByTestId('ch-ngre-nbuvArbeitgeberChf')
    fireEvent.change(nbuv, { target: { value: '120' } })
    fireEvent.keyDown(nbuv, { key: 'Enter' })
    fireEvent.blur(nbuv)
    await waitFor(() => expect(bodies).toContainEqual({ nbuvArbeitgeberChf: 120 }))
  })

  it('saves the Swiss health insurance as cleared when the user empties a stored amount', async () => {
    openMask({ ...EMPTY_CH, items: [{ kind: 'Krankenkasse', amountChf: 3000 }] as never })
    const bodies = recordPuts('vorsorge')
    renderScreen()
    const field = await screen.findByTestId('ch-vorsorge-krankenkasseChf')
    expect((field as HTMLInputElement).value).toBe('3000')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    await waitFor(() => expect(bodies).toEqual([{ krankenkasseChf: null }]))
  })

  it('fills the employer address from one picked suggestion', async () => {
    openMask()
    const bodies = recordPuts('n-gre')
    server.use(
      http.post('*/v1/adressen/suche', () =>
        HttpResponse.json({ available: true, houseNumber: '5b', hits: [{ street: 'Hochstrasse', postalCode: '8205', city: 'Schaffhausen', state: 'SH' }] }),
      ),
    )
    renderScreen()
    fireEvent.change(await screen.findByTestId('ch-ngre-adresssuche'), { target: { value: 'Hochstrasse 5b Schaffhausen' } })
    fireEvent.click(await screen.findByTestId('ch-ngre-adresssuche-treffer-0'))
    await waitFor(() => expect(bodies).toEqual([{ arbeitgeberStrasse: 'Hochstrasse 5b', arbeitgeberPlzOrt: '8205 Schaffhausen' }]))
    expect((screen.getByTestId('ch-ngre-arbeitgeberStrasse') as HTMLInputElement).value).toBe('Hochstrasse 5b')
  })
})

describe('Grenzgänger — the Lohnausweis upload fails', () => {
  function chooseFile(file: File) {
    const input = screen.getByTestId('ch-lohnausweis-upload-card').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('refuses a file type it cannot read', async () => {
    openMask()
    renderScreen()
    await screen.findByTestId('ch-lohnausweis-upload-card')
    chooseFile(new File(['x'], 'notiz.txt', { type: 'text/plain' }))
    expect((await screen.findByTestId('ch-lohnausweis-upload-status')).textContent).toBe('Bitte wähle eine PDF-, JPEG-, PNG- oder WebP-Datei aus.')
  })

  it('says so when the certificate could not be stored', async () => {
    openMask()
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ message: 'no' }, { status: 500 })))
    renderScreen()
    await screen.findByTestId('ch-lohnausweis-upload-card')
    chooseFile(new File(['%PDF-1.4'], 'lohnausweis.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(screen.getByTestId('ch-lohnausweis-upload-status').textContent).toBe('Der Upload hat nicht geklappt. Prüf die Verbindung und versuch es noch einmal.'))
  })
})

describe('Grenzgänger — the document names somebody: „Für wen?“', () => {
  function parseResponse(question: unknown) {
    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: TAX_YEAR },
      stagedAction: null,
      assistantMessage: null,
      draftsTaxYear: TAX_YEAR,
      filedInTaxYear: TAX_YEAR,
      noValuesReason: null,
      duplicateOf: null,
      assignment: { holder: null, question, alsoFor: [] },
      processing: { state: 'vorschlaege', reason: null, pending: 2, applied: 0, dismissed: 0, draftsTaxYear: TAX_YEAR, open: true },
    }
  }

  async function uploadWith(question: unknown, second: unknown = null) {
    openMask()
    const bodies: Array<Record<string, unknown>> = []
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-1' }, { status: 201 })),
      http.post('*/v1/belege/parse', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(parseResponse(bodies.length === 1 ? question : second), { status: 200 })
      }),
    )
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnausweis - Certificat de salaire', usedOcrFallback: false, pagesProcessed: 1 })
    renderScreen()
    const input = (await screen.findByTestId('ch-lohnausweis-upload-card')).querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'lohnausweis.pdf', { type: 'application/pdf' })] } })
    return bodies
  }

  it('asks for whom the certificate is and reads it again for the chosen person', async () => {
    const question = { reason: 'which', options: [{ holder: 'A', name: null }, { holder: 'B', name: 'Nora' }], preselected: 'A', printedName: 'Muster Nora', area: null, offerCreate: [] }
    const bodies = await uploadWith(question, null)
    fireEvent.click(await screen.findByTestId('beleg-zuordnung-fuer-B'))
    await waitFor(() => expect(bodies.length).toBe(2))
    expect(bodies[1]).toEqual(expect.objectContaining({ holder: 'B' }))
    await waitFor(() => expect(screen.queryByTestId('beleg-zuordnung')).toBeNull())
  })

  it('reads the certificate for the user after „Ja, das bin ich“', async () => {
    const question = { reason: 'confirmSelf', options: [], preselected: null, printedName: 'Max Muster', area: { holder: 'A', name: null }, offerCreate: [] }
    server.use(http.put('*/v1/profile', () => HttpResponse.json({}, { status: 200 })), http.get('*/v1/profile', () => HttpResponse.json({ firstName: null, lastName: null })))
    const bodies = await uploadWith(question, null)
    fireEvent.click(await screen.findByTestId('beleg-zuordnung-name-uebernehmen'))
    fireEvent.click(await screen.findByTestId('beleg-zuordnung-bin-ich'))
    await waitFor(() => expect(bodies.length).toBe(2))
    expect(bodies[1]).toEqual(expect.objectContaining({ holder: 'A' }))
  })
})

describe('Grenzgänger — the partner’s mask writes only to the partner’s certificate', () => {
  it('saves exchange rate, N-Gre answer and Swiss insurance with ?person=B', async () => {
    server.use(http.get(CH_URL, () => HttpResponse.json({ ...EMPTY_CH, status: 'echter-grenzgaenger' }, { status: 200 })))
    const searches: string[] = []
    server.use(
      http.put(`${CH_URL}/:rest*`, ({ request }) => {
        searches.push(`${new URL(request.url).pathname.split('/').pop()}${new URL(request.url).search}`)
        return HttpResponse.json({ ...EMPTY_CH, status: 'echter-grenzgaenger' }, { status: 200 })
      }),
    )
    renderScreen({ partnerName: 'Nora' })
    fireEvent.click(await screen.findByTestId('ch-wechselkurs-monat-03'))
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '0,95' } })
    fireEvent.click(screen.getByTestId('ch-wechselkurs-speichern'))
    fireEvent.click(screen.getByTestId('ch-ngre-sonderfaelle-nein'))
    const insurance = screen.getByTestId('ch-vorsorge-saeule3aChf')
    fireEvent.change(insurance, { target: { value: '2000' } })
    fireEvent.blur(insurance)
    await waitFor(() => expect(searches.length).toBe(3))
    expect(searches.every((entry) => entry.endsWith('?person=B'))).toBe(true)
    expect(screen.getByTestId('ch-partner-hinweis').textContent).toContain('Nora')
  })
})
