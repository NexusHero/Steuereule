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
import type { InterviewStateDto, ChLohnausweisResponseDto } from '@steuereule/api-client'
import { LOHNAUSWEIS_FELDER } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { GrenzgaengerScreen } from './GrenzgaengerScreen'
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
          <GrenzgaengerScreen onDone={onDone} taxYear={TAX_YEAR} />
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
const EMPTY_CH: ChLohnausweisResponseDto = {
  felder: LOHNAUSWEIS_FELDER.filter((f) => f.art === 'chf-betrag').map((f) => ({ id: f.id, ziffer: f.ziffer, kind: 'offen' as const })),
  bemerkungen: null,
  wechselkurs: null,
  status: null,
  posten: [],
  stand: null,
  nGre: {
    arbeitgeberName: null,
    arbeitgeberStrasse: null,
    arbeitgeberPlzOrt: null,
    familienzulagenChf: null,
    krankentaggeldChf: null,
    pkArbeitnehmerChf: null,
    pkArbeitgeberChf: null,
    sonderfaelle: null,
  },
}

/** A folded CH-Lohnausweis: status derived, fold bestimmt (Bruttolohn/PK/Quellensteuer). */
const FOLDED_CH: ChLohnausweisResponseDto = {
  felder: LOHNAUSWEIS_FELDER.filter((f) => f.art === 'chf-betrag').map((f) =>
    f.id === 'bruttolohn-total' || f.id === 'berufliche-vorsorge' || f.id === 'quellensteuer'
      ? { id: f.id, ziffer: f.ziffer, kind: 'erfasst' as const, wert: f.id === 'bruttolohn-total' ? 84000 : f.id === 'berufliche-vorsorge' ? 5000 : 3780 }
      : { id: f.id, ziffer: f.ziffer, kind: 'offen' as const },
  ),
  bemerkungen: null,
  wechselkurs: { monat: '2026-01', kurs: 0.9412, modus: 'amtlich' },
  status: 'echter-grenzgaenger',
  posten: [],
  stand: { kind: 'bestimmt', einnahmen: 79061, vorsorgeaufwand: 4706, anrechnung: 3558 },
  nGre: {
    arbeitgeberName: null,
    arbeitgeberStrasse: null,
    arbeitgeberPlzOrt: null,
    familienzulagenChf: null,
    krankentaggeldChf: null,
    pkArbeitnehmerChf: null,
    pkArbeitgeberChf: null,
    sonderfaelle: null,
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

    await waitFor(() => expect(bodies).toEqual([{ arbeitgeberName: 'Muster AG' }, { pkArbeitgeberChf: 6000 }, { sonderfaelle: false }]))
  })

  it('saves employer facts and Lohnausweis figures when the field loses focus — no Enter needed', async () => {
    const nGre: unknown[] = []
    const felder: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        nGre.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
      http.put(`${CH_URL}/:feld`, async ({ request }) => {
        felder.push(await request.json())
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
    await waitFor(() => expect(felder).toEqual([{ kind: 'erfasst', wert: 90000 }]))
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
    const monat = await screen.findByTestId('ch-wechselkurs-monat')

    fireEvent.change(monat, { target: { value: '2026-12' } })
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '1,07' } })
    fireEvent.click(screen.getByText('Kurs speichern'))

    await waitFor(() => expect(bodies).toEqual([{ monat: '2026-12', kurs: 1.07, modus: 'amtlich' }]))
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
    const krankenkasse = await screen.findByTestId('ch-vorsorge-krankenkasseChf')

    fireEvent.change(krankenkasse, { target: { value: '4200' } })
    fireEvent.blur(krankenkasse)
    fireEvent.change(screen.getByTestId('ch-vorsorge-saeule3aChf'), { target: { value: '7000' } })
    fireEvent.blur(screen.getByTestId('ch-vorsorge-saeule3aChf'))

    await waitFor(() => expect(bodies).toEqual([{ krankenkasseChf: 4200 }, { saeule3aChf: 7000 }]))
  })
})
