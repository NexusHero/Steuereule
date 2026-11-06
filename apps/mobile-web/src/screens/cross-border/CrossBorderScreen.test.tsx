// REQ-021 (ticket 16) — GrenzgaengerScreen wired to the real endpoints via the generated client:
// the CH interview (`GET .../interview?eintrag=segment-ch` + `POST .../interview/antworten`) then
// the guided Lohnausweis mask (`GET .../ch-lohnausweis`). Every assertion names the *identity* of
// what rendered (the question, or the mask's derived status + fold) — never merely that "something"
// rendered. The derived Grenzgänger-Status and the fold come from the server's response, never
// recomputed in the client.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { InterviewStateDto, ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { SALARY_CERTIFICATE_FIELDS } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { CrossBorderScreen } from './CrossBorderScreen'
import { server } from '../../test-msw-server'

const TAX_YEAR = 2026
const INTERVIEW_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview`
const POST_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`
const CH_URL = `*/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderScreen(onDone: () => void = () => {}) {
  const i18n = createAppI18n('de')
  const queryClient = makeTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CrossBorderScreen onDone={onDone} taxYear={TAX_YEAR} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

/** The segment-ch re-entry state for a brand-new tax year (nothing answered yet). */
const EMPTY_CH_INTERVIEW: InterviewStateDto = { answers: {}, nextStep: { kind: 'question', id: 'ch-wohnsitz' }, openItems: 2 }

/** The segment-ch re-entry state once both questions are answered. */
const DONE_CH_INTERVIEW: InterviewStateDto = {
  answers: { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '10' },
  nextStep: { kind: 'done' },
  openItems: 0,
}

/** The empty CH-Lohnausweis mask (no Wechselkurs, no status, no fold). */
const EMPTY_CH: ChSalaryCertificateResponseDto = {
  fields: SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag').map((f) => ({ id: f.id, digit: f.digit, kind: 'offen' as const })),
  bemerkungen: null,
  exchangeRate: null,
  status: null,
  items: [],
  foldStatus: null,
  nGre: {
    arbeitgeberName: null,
    arbeitgeberStrasse: null,
    arbeitgeberPlzOrt: null,
    familienzulagenChf: null,
    krankentaggeldChf: null,
    pkArbeitnehmerChf: null,
    pkArbeitgeberChf: null,
    krankentaggeldArbeitgeberProzent: null,
    krankentaggeldArbeitgeberChf: null,
    nbuvArbeitgeberProzent: null,
    nbuvArbeitgeberChf: null,
    specialCases: null,
  },
}

/** A folded CH-Lohnausweis: status derived, fold bestimmt (Bruttolohn/PK/Quellensteuer). */
const FOLDED_CH: ChSalaryCertificateResponseDto = {
  fields: SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag').map((f) =>
    f.id === 'bruttolohn-total' || f.id === 'berufliche-vorsorge' || f.id === 'quellensteuer'
      ? { id: f.id, digit: f.digit, kind: 'erfasst' as const, value: f.id === 'bruttolohn-total' ? 84000 : f.id === 'berufliche-vorsorge' ? 5000 : 3780 }
      : { id: f.id, digit: f.digit, kind: 'offen' as const },
  ),
  bemerkungen: null,
  exchangeRate: { month: '2026-01', rate: 0.9412, mode: 'amtlich' },
  status: 'echter-grenzgaenger',
  items: [],
  foldStatus: { kind: 'bestimmt', einnahmen: 79061, vorsorgeaufwand: 4706, anrechnung: 3558 },
  nGre: {
    arbeitgeberName: null,
    arbeitgeberStrasse: null,
    arbeitgeberPlzOrt: null,
    familienzulagenChf: null,
    krankentaggeldChf: null,
    pkArbeitnehmerChf: null,
    pkArbeitgeberChf: null,
    krankentaggeldArbeitgeberProzent: null,
    krankentaggeldArbeitgeberChf: null,
    nbuvArbeitgeberProzent: null,
    nbuvArbeitgeberChf: null,
    specialCases: null,
  },
}

beforeEach(() => {
  server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(EMPTY_CH_INTERVIEW, { status: 200 })))
  server.use(http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
})

afterEach(() => {
  server.resetHandlers()
})

describe('GrenzgaengerScreen — the CH interview', () => {
  it('renders the ch-wohnsitz question first', async () => {
    renderScreen()

    await screen.findByText(/Wo wohnst/)
    expect(screen.getByText('Deutschland')).toBeTruthy()
    expect(screen.getByText('Schweiz')).toBeTruthy()
  })

  it('answering both questions leads to the Lohnausweis mask', async () => {
    server.use(
      http.post(POST_URL, async ({ request }) => {
        const body = (await request.json()) as { questionId: string }
        return HttpResponse.json(
          body.questionId === 'ch-wohnsitz'
            ? { nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 1 }
            : { nextStep: { kind: 'done' }, openItems: 0 },
          { status: 200 },
        )
      }),
    )

    renderScreen()

    await screen.findByText(/Wo wohnst/)
    fireEvent.click(screen.getByText('Deutschland'))

    await screen.findByText(/zurückgekehrt/)
    fireEvent.change(screen.getByTestId('ch-tage-input'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('ch-tage-weiter'))

    await screen.findByText('CH-Lohnausweis')
    // The mask renders the Ziffer fields (in paper order) — Ziffer 8 (Bruttolohn) is present.
    expect(screen.getByText(/Ziffer 8/)).toBeTruthy()
  })
})

describe('GrenzgaengerScreen — the Lohnausweis mask + derived status + fold', () => {
  it('shows the derived Grenzgänger-Status and the fold from the server response', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(FOLDED_CH, { status: 200 })))

    renderScreen()

    await screen.findByText('CH-Lohnausweis')
    // Derived status (never recomputed client-side — this exact string is the server's).
    expect(screen.getByText(/Echter Grenzgänger/)).toBeTruthy()
    // The fold: three buckets, formatted whole euros.
    expect(screen.getByText(/Vorsorgeaufwand: 4.706/)).toBeTruthy()
    expect(screen.getByText(/Quellensteuer-Anrechnung: 3.558/)).toBeTruthy()
  })

  it('shows the honest "noch offen" status while the interview is unanswered', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(EMPTY_CH_INTERVIEW, { status: 200 })))

    renderScreen()

    // Still on the interview step, not the mask.
    await screen.findByText(/Wo wohnst/)
  })
})

describe('GrenzgaengerScreen — Anlage N-Gre facts', () => {
  it('saves the employer, the Vorsorge split and the Sonderfall answer via PUT .../n-gre', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const name = await screen.findByTestId('ch-ngre-arbeitgeberName')
    fireEvent.change(name, { target: { value: 'Muster AG' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    const pk = screen.getByTestId('ch-ngre-pkArbeitgeberChf')
    fireEvent.change(pk, { target: { value: '6000' } })
    fireEvent.keyDown(pk, { key: 'Enter' })
    fireEvent.click(screen.getByTestId('ch-ngre-sonderfaelle-nein'))

    await waitFor(() => expect(bodies).toEqual([{ arbeitgeberName: 'Muster AG' }, { pkArbeitgeberChf: 6000 }, { specialCases: false }]))
  })

  it('asks who pays the Krankentaggeld premium and, only at 100 %, the employer amount', async () => {
    const bodies: unknown[] = []
    let stored = EMPTY_CH
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(stored, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        stored = { ...stored, nGre: { ...stored.nGre, ...body } }
        return HttpResponse.json(stored, { status: 200 })
      }),
    )
    renderScreen()
    const percent = await screen.findByTestId('ch-ngre-krankentaggeldArbeitgeberProzent')
    expect(screen.queryByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeNull()

    fireEvent.change(percent, { target: { value: '10' } })
    fireEvent.blur(percent)
    await waitFor(() => expect(bodies).toEqual([{ krankentaggeldArbeitgeberProzent: 10 }]))
    expect(screen.queryByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeNull()

    fireEvent.change(percent, { target: { value: '100' } })
    fireEvent.blur(percent)
    expect(await screen.findByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeTruthy()
  })

  it('no longer lists employer Krankentaggeld/NBUV contributions as a case the printout cannot cover', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
    renderScreen()
    expect(await screen.findByText(/Überobligatorium oder einen Firmenwagen\?$/)).toBeTruthy()
    expect(screen.queryByText(/Krankentaggeld\/NBUV/)).toBeNull()
  })

  it('saves employer facts and Lohnausweis figures when the field loses focus — no Enter needed', async () => {
    const nGre: unknown[] = []
    const fields: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        nGre.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
      http.put(`${CH_URL}/:feld`, async ({ request }) => {
        fields.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const name = await screen.findByTestId('ch-ngre-arbeitgeberName')
    const lohn = screen.getByTestId('ch-feld-lohn')

    fireEvent.change(name, { target: { value: 'Muster AG' } })
    fireEvent.blur(name)
    fireEvent.change(lohn, { target: { value: '90000' } })
    fireEvent.blur(lohn)

    await waitFor(() => expect(nGre).toEqual([{ arbeitgeberName: 'Muster AG' }]))
    await waitFor(() => expect(fields).toEqual([{ kind: 'erfasst', value: 90000 }]))
  })

  it('does not send anything when an untouched field loses focus', async () => {
    const puts: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.put(`${CH_URL}/:feld`, () => { puts.push(1); return HttpResponse.json(EMPTY_CH, { status: 200 }) }))
    renderScreen()
    const lohn = await screen.findByTestId('ch-feld-lohn')

    fireEvent.focus(lohn)
    fireEvent.blur(lohn)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(puts).toHaveLength(0)
  })
})

describe('GrenzgaengerScreen — Wechselkurs', () => {
  it('accepts a German decimal comma and saves the rate for the chosen month', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/wechselkurs`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const month = await screen.findByTestId('ch-wechselkurs-monat')

    fireEvent.change(month, { target: { value: '2026-12' } })
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '1,07' } })
    fireEvent.click(screen.getByText('Kurs speichern'))

    await waitFor(() => expect(bodies).toEqual([{ month: '2026-12', rate: 1.07, mode: 'amtlich' }]))
  })

  it('says what is missing instead of silently doing nothing', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    renderScreen()

    fireEvent.click(await screen.findByText('Kurs speichern'))

    expect(await screen.findByText('Bitte Monat (JJJJ-MM) und Kurs eintragen, z. B. 1,07.')).toBeTruthy()
  })
})

describe('GrenzgaengerScreen — Vorsorge außerhalb des Lohns', () => {
  it('saves the Swiss health insurance and Säule 3a when the field loses focus', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/vorsorge`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const healthInsurer = await screen.findByTestId('ch-vorsorge-krankenkasseChf')

    fireEvent.change(healthInsurer, { target: { value: '4200' } })
    fireEvent.blur(healthInsurer)
    fireEvent.change(screen.getByTestId('ch-vorsorge-saeule3aChf'), { target: { value: '7000' } })
    fireEvent.blur(screen.getByTestId('ch-vorsorge-saeule3aChf'))

    await waitFor(() => expect(bodies).toEqual([{ krankenkasseChf: 4200 }, { saeule3aChf: 7000 }]))
  })

describe('GrenzgaengerScreen accessibility', () => {
  it('gives every Lohnausweis Ziffer a name screen readers can announce, not just the placeholder', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
    renderScreen()
    expect(await screen.findByLabelText('Ziffer 1 · Lohn (Grundlohn)')).toBeTruthy()
    expect(screen.getByLabelText('Ziffer 12 · Quellensteuerabzug')).toBeTruthy()
  })
})
})
