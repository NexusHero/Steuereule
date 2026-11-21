// REQ-021 (ticket 16) — GrenzgaengerScreen wired to the real endpoints via the generated client:
// the CH interview (`GET .../interview?eintrag=segment-ch` + `POST .../interview/antworten`) then
// the guided Lohnausweis mask (`GET .../ch-lohnausweis`). Every assertion names the *identity* of
// what rendered (the question, or the mask's derived status + fold) — never merely that "something"
// rendered. The derived Grenzgänger-Status and the fold come from the server's response, never
// recomputed in the client.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { InterviewStateDto, ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { SALARY_CERTIFICATE_FIELDS } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { CrossBorderScreen } from './CrossBorderScreen'
import { EMPTY_CH_SALARY_CERTIFICATE_RESPONSE, server } from '../../test-msw-server'

const { mockExtractDocumentText } = vi.hoisted(() => ({ mockExtractDocumentText: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: mockExtractDocumentText }
})

const TAX_YEAR = 2026
const INTERVIEW_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview`
const POST_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`
const CH_URL = `*/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderScreen(onDone: () => void = () => {}, onBack?: () => void, partnerName?: string) {
  const i18n = createAppI18n('de')
  const queryClient = makeTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CrossBorderScreen onDone={onDone} {...(onBack ? { onBack } : {})} {...(partnerName ? { partnerName } : {})} taxYear={TAX_YEAR} />
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
const EMPTY_CH = EMPTY_CH_SALARY_CERTIFICATE_RESPONSE

/** The server's answer to a stored CH answer: Wohnsitz leads on to the Tage question, Tage completes the segment. */
function answerStored(questionId: string) {
  return HttpResponse.json(
    questionId === 'ch-wohnsitz'
      ? { nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 1 }
      : { nextStep: { kind: 'done' }, openItems: 0 },
    { status: 200 },
  )
}

/** Answers both CH questions through the UI: Wohnsitz Deutschland, 10 Nichtrückkehrtage. */
async function answerBothChQuestions() {
  await screen.findByText(/Wo wohnst/)
  fireEvent.click(screen.getByText('Deutschland'))

  await screen.findByText(/zurückgekehrt/)
  fireEvent.change(screen.getByTestId('ch-tage-input'), { target: { value: '10' } })
  fireEvent.click(screen.getByTestId('ch-tage-weiter'))
}

/** Opens the mask directly (interview done) and records every body PUT to the Wechselkurs endpoint. */
function recordExchangeRatePuts() {
  const bodies: unknown[] = []
  server.use(
    http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
    http.put(`${CH_URL}/wechselkurs`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(EMPTY_CH, { status: 200 })
    }),
  )
  return bodies
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
    pkArbeitgeberGesamtChf: null,
    steuerfreiesKrankentaggeldChf: null,
    steuerfreiesUnfalltaggeldChf: null,
    taggeldQuelle: null,
    krankentaggeldArbeitgeberProzent: null,
    krankentaggeldArbeitgeberChf: null,
    nbuvArbeitgeberProzent: null,
    nbuvArbeitgeberChf: null,
    specialCases: null,
    krankenkasseZusatzChf: null,
    kvZuschussAnspruch: null,
    familienzulagenImBruttolohn: null,
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
        return answerStored(body.questionId)
      }),
    )

    renderScreen()

    await answerBothChQuestions()

    await screen.findByText('CH-Lohnausweis')
    // The mask renders the Ziffer fields (in paper order) — Ziffer 8 (Bruttolohn) is present.
    expect(screen.getAllByText(/Ziffer 8/).length).toBeGreaterThan(0)
  })
})

describe('GrenzgaengerScreen — CH answers are posted in order', () => {
  it('sends Tage only after the server stored Wohnsitz, so it is never unreachable', async () => {
    const received: string[] = []
    let releaseWohnsitz: () => void = () => {}
    const wohnsitzHeld = new Promise<void>((resolve) => {
      releaseWohnsitz = resolve
    })
    server.use(
      http.post(POST_URL, async ({ request }) => {
        const body = (await request.json()) as { questionId: string }
        received.push(body.questionId)
        if (body.questionId === 'ch-wohnsitz') await wohnsitzHeld
        return answerStored(body.questionId)
      }),
    )

    renderScreen()
    await answerBothChQuestions()

    await new Promise((r) => setTimeout(r, 30))
    expect(received).toEqual(['ch-wohnsitz'])
    releaseWohnsitz()
    await waitFor(() => expect(received).toEqual(['ch-wohnsitz', 'ch-nichtrueckkehrtage']))
    await screen.findByText('CH-Lohnausweis')
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
    expect(await screen.findByText(/Wo wohnst/)).toBeTruthy()
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

  it('saves the employer pension total next to its Obligatorium and the tax-free Krankentaggeld paid out', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    expect(await screen.findByText('Pensionskasse – alle Beiträge des Arbeitgebers, obligatorisch und überobligatorisch (CHF)')).toBeTruthy()
    fireEvent.click(screen.getByTestId('ch-ngre-taggeldQuelle-krankentaggeldversicherung'))
    for (const [id, value] of [
      ['ch-ngre-pkArbeitgeberGesamtChf', '7186'],
      ['ch-ngre-pkArbeitgeberChf', '2892'],
      ['ch-ngre-steuerfreiesKrankentaggeldChf', '3853'],
    ] as const) {
      const input = await screen.findByTestId(id)
      fireEvent.change(input, { target: { value } })
      fireEvent.keyDown(input, { key: 'Enter' })
    }
    await waitFor(() =>
      expect(bodies).toEqual([
        { taggeldQuelle: 'krankentaggeldversicherung', steuerfreiesKrankentaggeldChf: null, steuerfreiesUnfalltaggeldChf: null },
        { pkArbeitgeberGesamtChf: 7186 },
        { pkArbeitgeberChf: 2892 },
        { steuerfreiesKrankentaggeldChf: 3853 },
      ]),
    )
  })

  // ADR-0072, Punkt 5: where the money came from decides whether and where it is deducted.
  describe('the daily benefit in the gross wage: first where it came from, then the amount that fits', () => {
    const recordNGre = (stored: ChSalaryCertificateResponseDto = EMPTY_CH) => {
      const bodies: unknown[] = []
      server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
      server.use(http.get(CH_URL, () => HttpResponse.json(stored, { status: 200 })))
      server.use(
        http.put(`${CH_URL}/n-gre`, async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json(stored, { status: 200 })
        }),
      )
      return bodies
    }

    it('asks the question with the six answers, above the amount fields, and shows no amount before the answer', async () => {
      recordNGre()
      renderScreen()
      expect(await screen.findByText('Woher kam das Taggeld im Bruttolohn (Ziffer 8)?')).toBeTruthy()
      for (const label of [
        'Krankentaggeldversicherung (mit dem Lohn verrechnet)',
        'Lohnfortzahlung des Arbeitgebers ohne Versicherung',
        'beides (Versicherung zahlt einen Teil, der Arbeitgeber stockt auf)',
        'Unfallversicherung (UVG/SUVA)',
        'Mutterschaft / IV',
        'kein Taggeld',
      ]) {
        expect(screen.getByText(label)).toBeTruthy()
      }
      expect(screen.queryByTestId('ch-ngre-steuerfreiesKrankentaggeldChf')).toBeNull()
      expect(screen.queryByTestId('ch-ngre-steuerfreiesUnfalltaggeldChf')).toBeNull()
    })

    it('shows only the accident field for the accident insurance, with its help, and saves the rounded amount', async () => {
      const bodies = recordNGre()
      renderScreen()
      fireEvent.click(await screen.findByTestId('ch-ngre-taggeldQuelle-unfallversicherung'))
      const accident = await screen.findByTestId('ch-ngre-steuerfreiesUnfalltaggeldChf')
      expect(screen.getByText('Unfalltaggeld (UVG/SUVA) im Bruttolohn (CHF)')).toBeTruthy()
      expect(screen.getByText('Steuerfrei, erhöht aber den Steuersatz (Progressionsvorbehalt).')).toBeTruthy()
      expect(screen.queryByTestId('ch-ngre-steuerfreiesKrankentaggeldChf')).toBeNull()

      // Typed as on the benefit statement, with cents: rounded to whole CHF, shown as stored.
      fireEvent.change(accident, { target: { value: '2249,60' } })
      fireEvent.blur(accident)
      await waitFor(() =>
        expect(bodies).toEqual([
          { taggeldQuelle: 'unfallversicherung', steuerfreiesKrankentaggeldChf: null, steuerfreiesUnfalltaggeldChf: null },
          { steuerfreiesUnfalltaggeldChf: 2250 },
        ]),
      )
      expect((accident as HTMLInputElement).value).toBe('2250')
    })

    it('asks only for the insurer’s part for „beides“ and says the top-up stays wage', async () => {
      const bodies = recordNGre()
      renderScreen()
      fireEvent.click(await screen.findByTestId('ch-ngre-taggeldQuelle-beides'))
      const part = await screen.findByTestId('ch-ngre-steuerfreiesKrankentaggeldChf')
      expect(screen.getByText('Davon von der Versicherung gezahlt (CHF)')).toBeTruthy()
      expect(screen.getByText('Nur den Teil der Versicherung laut Taggeld-Abrechnung. Die Aufstockung des Arbeitgebers bleibt Lohn und wird nicht abgezogen.')).toBeTruthy()
      fireEvent.change(part, { target: { value: '3360' } })
      fireEvent.keyDown(part, { key: 'Enter' })
      await waitFor(() => expect(bodies).toEqual([{ taggeldQuelle: 'beides', steuerfreiesKrankentaggeldChf: null, steuerfreiesUnfalltaggeldChf: null }, { steuerfreiesKrankentaggeldChf: 3360 }]))
    })

    it('stores 0 for the employer’s continued pay and shows no amount to deduct', async () => {
      const bodies = recordNGre()
      renderScreen()
      fireEvent.click(await screen.findByTestId('ch-ngre-taggeldQuelle-lohnfortzahlung'))
      await waitFor(() => expect(bodies).toEqual([{ taggeldQuelle: 'lohnfortzahlung', steuerfreiesKrankentaggeldChf: 0, steuerfreiesUnfalltaggeldChf: null }]))
      expect(screen.getByText('Die Lohnfortzahlung des Arbeitgebers ist Lohn: Es wird nichts abgezogen.')).toBeTruthy()
      expect(screen.queryByTestId('ch-ngre-steuerfreiesKrankentaggeldChf')).toBeNull()
      expect(screen.queryByTestId('ch-ngre-steuerfreiesUnfalltaggeldChf')).toBeNull()
    })

    it('shows the AHV hint beside the question once Ziffer 8, Ziffer 9 and the amount are known, as a hint only', async () => {
      const figures: Record<string, number> = { 'bruttolohn-total': 90000, 'ahv-beitraege': 5380 }
      recordNGre({
        ...EMPTY_CH,
        fields: EMPTY_CH.fields.map((f) => {
          const value = figures[f.id]
          return value === undefined ? f : { ...f, kind: 'erfasst' as const, value }
        }),
        nGre: { ...EMPTY_CH.nGre, taggeldQuelle: 'krankentaggeldversicherung', steuerfreiesKrankentaggeldChf: 6000 },
      })
      renderScreen()
      const hint = await screen.findByTestId('ch-ngre-taggeld-ahv-hinweis')
      expect(hint.textContent).toContain('keine Entscheidung')
      expect(hint.textContent).toContain('ohne das Taggeld')
      expect(hint.textContent).toContain('Versicherungsleistung')
      // Only the field of the answer is shown, with the stored amount.
      expect((screen.getByTestId('ch-ngre-steuerfreiesKrankentaggeldChf') as HTMLInputElement).value).toBe('6000')
      expect(screen.queryByTestId('ch-ngre-steuerfreiesUnfalltaggeldChf')).toBeNull()
    })

    it('still shows an amount recorded before the question, until the answer is given', async () => {
      recordNGre({ ...EMPTY_CH, nGre: { ...EMPTY_CH.nGre, steuerfreiesKrankentaggeldChf: 3853 } })
      renderScreen()
      expect(((await screen.findByTestId('ch-ngre-steuerfreiesKrankentaggeldChf')) as HTMLInputElement).value).toBe('3853')
    })
  })

  it('asks who pays the Krankentaggeld premium and the employer amount while the share is open or 100 %', async () => {
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
    // An employer's premium letter gives the amount before anyone knows the share (ADR-0076).
    expect(screen.getByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeTruthy()

    fireEvent.change(percent, { target: { value: '10' } })
    fireEvent.blur(percent)
    await waitFor(() => expect(bodies).toEqual([{ krankentaggeldArbeitgeberProzent: 10 }]))
    expect(screen.queryByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeNull()

    fireEvent.change(percent, { target: { value: '100' } })
    fireEvent.blur(percent)
    expect(await screen.findByTestId('ch-ngre-krankentaggeldArbeitgeberChf')).toBeTruthy()
  })

  it('no longer lists Krankentaggeld, employer Krankentaggeld/NBUV contributions or the Überobligatorium as cases the printout cannot cover', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
    renderScreen()
    const question = await screen.findByText(/Spesenpauschalen oder einen Firmenwagen\?$/)
    expect(question.textContent).not.toMatch(/Krankentag|Überobligatorium/)
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

  it('accepts a negative Ziffer 7 end to end, but refuses a negative value in any other Ziffer', async () => {
    const fields: unknown[] = []
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
      http.put(`${CH_URL}/:feld`, async ({ params, request }) => {
        fields.push({ feld: params['feld'], body: await request.json() })
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const andere = await screen.findByTestId('ch-feld-andere-leistungen')
    fireEvent.change(andere, { target: { value: '-75' } })
    fireEvent.blur(andere)
    await waitFor(() => expect(fields).toEqual([{ feld: 'andere-leistungen', body: { kind: 'erfasst', value: -75 } }]))

    const lohn = screen.getByTestId('ch-feld-lohn')
    fireEvent.change(lohn, { target: { value: '-5' } })
    fireEvent.blur(lohn)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fields).toHaveLength(1)
  })

  it('saves the new N-Gre answers and the supplementary insurance through the N-Gre PUT', async () => {
    const nGre: unknown[] = []
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        nGre.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-ngre-familienzulagen-im-brutto-nein'))
    fireEvent.click(screen.getByTestId('ch-ngre-kv-zuschuss-ja'))
    const zusatz = screen.getByTestId('ch-vorsorge-krankenkasseZusatzChf')
    fireEvent.change(zusatz, { target: { value: '0' } })
    fireEvent.blur(zusatz)
    await waitFor(() =>
      expect(nGre).toEqual([{ familienzulagenImBruttolohn: false }, { kvZuschussAnspruch: true }, { krankenkasseZusatzChf: 0 }]),
    )
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
    const bodies = recordExchangeRatePuts()
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-wechselkurs-monat-12'))
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '1,07' } })
    fireEvent.click(screen.getByText('Kurs speichern'))

    await waitFor(() => expect(bodies).toEqual([{ month: '2026-12', rate: 1.07, mode: 'amtlich' }]))
  })

  it('offers the Jahresdurchschnittskurs instead of a month and saves it for the year', async () => {
    const bodies = recordExchangeRatePuts()
    renderScreen()
    fireEvent.click(await screen.findByTestId('ch-wechselkurs-jahresdurchschnitt'))
    fireEvent.change(screen.getByTestId('ch-wechselkurs-kurs'), { target: { value: '1,065' } })
    fireEvent.click(screen.getByText('Kurs speichern'))

    await waitFor(() => expect(bodies).toEqual([{ month: `${TAX_YEAR}`, rate: 1.065, mode: 'jahresdurchschnitt' }]))
  })

  it('says what is missing instead of silently doing nothing', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    renderScreen()

    fireEvent.click(await screen.findByText('Kurs speichern'))

    expect(await screen.findByText('Bitte Monat oder Jahresdurchschnitt wählen und Kurs eintragen, z. B. 1,07.')).toBeTruthy()
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
})

describe('GrenzgaengerScreen: amounts typed as they are printed', () => {
  it('rounds a rappen amount to whole francs instead of dropping it, and shows what it stored', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/vorsorge`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()
    const healthInsurer = (await screen.findByTestId('ch-vorsorge-krankenkasseChf')) as HTMLInputElement
    fireEvent.change(healthInsurer, { target: { value: '948,60' } })
    fireEvent.blur(healthInsurer)
    await waitFor(() => expect(bodies).toEqual([{ krankenkasseChf: 949 }]))
    expect(healthInsurer.value).toBe('949')
  })

  it('says so when an amount cannot be read, instead of keeping silent', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    renderScreen()
    const healthInsurer = await screen.findByTestId('ch-vorsorge-krankenkasseChf')
    fireEvent.change(healthInsurer, { target: { value: 'viel' } })
    fireEvent.blur(healthInsurer)
    expect(await screen.findByText('Das ist kein Betrag. Bitte so eingeben: 948 oder 948,60.')).toBeTruthy()
  })
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

describe('GrenzgaengerScreen — onBack & saving race safety', () => {
  it('renders BackButton in Lohnausweis step when onBack is given and awaits in-flight save before calling onDone', async () => {
    let releasePut: () => void = () => {}
    const putPending = new Promise<void>((resolve) => {
      releasePut = resolve
    })
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
      http.put(`${CH_URL}/:feld`, async () => {
        await putPending
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    const onDone = vi.fn()
    const onBack = vi.fn()
    renderScreen(onDone, onBack)

    const lohn = await screen.findByTestId('ch-feld-lohn')
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()

    fireEvent.change(lohn, { target: { value: '90000' } })
    fireEvent.blur(lohn)
    fireEvent.click(screen.getByTestId('ch-lohnausweis-weiter'))

    await new Promise((r) => setTimeout(r, 20))
    expect(onDone).not.toHaveBeenCalled()

    releasePut()
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})

describe('GrenzgaengerScreen — the partner’s Swiss figures (escalation case: both spouses Grenzgänger)', () => {
  it('asks Person B’s residence and days, saves them with B’s mask, and reads and writes only ?person=B', async () => {
    const urls: string[] = []
    let facts: unknown = null
    let current: ChSalaryCertificateResponseDto = EMPTY_CH
    server.use(
      http.get(INTERVIEW_URL, ({ request }) => {
        urls.push(`interview ${request.url}`)
        return HttpResponse.json(EMPTY_CH_INTERVIEW, { status: 200 })
      }),
      http.get(CH_URL, ({ request }) => {
        urls.push(`get ${new URL(request.url).search}`)
        return HttpResponse.json(current, { status: 200 })
      }),
      http.put(`${CH_URL}/grenzgaenger`, async ({ request }) => {
        urls.push(`put grenzgaenger ${new URL(request.url).search}`)
        facts = await request.json()
        current = { ...EMPTY_CH, status: 'echter-grenzgaenger' }
        return HttpResponse.json(current, { status: 200 })
      }),
      http.put(`${CH_URL}/:feld`, ({ request }) => {
        urls.push(`put field ${new URL(request.url).search}`)
        return HttpResponse.json(current, { status: 200 })
      }),
    )

    renderScreen(() => {}, undefined, 'Nora')

    // The questions name Nora, not „du“ (Echtdatentest 18.11.2026).
    expect((await screen.findByTestId('ch-interview-titel')).textContent).toBe('Wo wohnt Nora?')
    expect(screen.getByTestId('ch-partner-hinweis').textContent).toContain('Nora')
    fireEvent.click(screen.getByText('Deutschland'))
    await screen.findByText(/zurückgekehrt/)
    expect(screen.getByTestId('ch-interview-titel').textContent).toBe('Wie viele Tage ist Nora nicht nach Hause zurückgekehrt?')
    fireEvent.change(screen.getByTestId('ch-tage-input'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('ch-tage-weiter'))

    await waitFor(() => expect(facts).toEqual({ residence: 'Deutschland', daysWithoutReturn: 0 }))
    const lohn = await screen.findByTestId('ch-feld-lohn')
    fireEvent.change(lohn, { target: { value: '31200' } })
    fireEvent.blur(lohn)

    await waitFor(() => expect(urls).toContain('put field ?person=B'))
    expect(urls.filter((u) => u.startsWith('interview'))).toEqual([])
    expect(urls.filter((u) => !u.endsWith('?person=B'))).toEqual([])
  })
})

describe('GrenzgaengerScreen — Smart summation, required indicators, upload & employer snapshots', () => {
  it('renders all 14 CHF fields, required badges, top missing-fields overview and direct receipt upload card', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get(CH_URL, () => HttpResponse.json(EMPTY_CH, { status: 200 })))
    renderScreen()

    await screen.findByText('CH-Lohnausweis')
    // All 14 CHF fields remain present
    const chfFields = SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag')
    expect(chfFields).toHaveLength(14)
    for (const f of chfFields) {
      expect(screen.getByTestId(`ch-feld-${f.id}`)).toBeTruthy()
    }

    // Required field badges & top open required fields overview
    expect(screen.getByTestId('ch-pflicht-bruttolohn-total')).toBeTruthy()
    expect(screen.getByTestId('ch-pflicht-berufliche-vorsorge')).toBeTruthy()
    expect(screen.getByTestId('ch-pflicht-quellensteuer')).toBeTruthy()
    expect(screen.getByTestId('ch-offene-pflichtfelder-banner').textContent).toContain('4 Pflichtangaben fehlen noch')

    // Direct Lohnausweis upload card
    expect(screen.getByTestId('ch-lohnausweis-upload-card')).toBeTruthy()
    expect(screen.getByTestId('ch-lohnausweis-upload-btn')).toBeTruthy()
  })

  it('automatically sums Ziffer 1 (Grundlohn) and Ziffer 2 (Gehaltsnebenleistungen) into Ziffer 8 (Bruttolohn total)', async () => {
    const saved: Array<{ feld: string; body: unknown }> = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(
      http.put(`${CH_URL}/:feld`, async ({ params, request }) => {
        saved.push({ feld: String(params.feld), body: await request.json() })
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()

    const lohn = (await screen.findByTestId('ch-feld-lohn')) as HTMLInputElement
    const neben = screen.getByTestId('ch-feld-gehaltsnebenleistungen') as HTMLInputElement
    const brutto = screen.getByTestId('ch-feld-bruttolohn-total') as HTMLInputElement

    fireEvent.change(lohn, { target: { value: '90000' } })
    fireEvent.blur(lohn)
    fireEvent.change(neben, { target: { value: '4200' } })
    fireEvent.blur(neben)

    expect(screen.getByTestId('ch-bruttolohn-summe-banner').textContent).toContain('94.200 CHF')
    expect(brutto.value).toBe('94200')

    await waitFor(() =>
      expect(saved).toContainEqual({
        feld: 'bruttolohn-total',
        body: { kind: 'erfasst', value: 94200 },
      }),
    )
  })

  it('snapshots an employer already recorded on a certificate into Anlage N-Gre with one click (Echtdatentest 18.11.2026)', async () => {
    const bodies: unknown[] = []
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get('*/v1/arbeitgeber', () => HttpResponse.json([{ name: 'Cilag AG', strasse: 'Hochstrasse 201', plzOrt: '8205 Schaffhausen' }], { status: 200 })))
    server.use(
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(EMPTY_CH, { status: 200 })
      }),
    )
    renderScreen()

    const chip = await screen.findByTestId('ch-ngre-arbeitgeber-chip-emp-cilag-ag')
    fireEvent.click(chip)

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          arbeitgeberName: 'Cilag AG',
          arbeitgeberStrasse: 'Hochstrasse 201',
          arbeitgeberPlzOrt: '8205 Schaffhausen',
        },
      ]),
    )
  })

  it('offers no employer in a fresh account — no fixed start list', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })))
    server.use(http.get('*/v1/arbeitgeber', () => HttpResponse.json([], { status: 200 })))
    renderScreen()
    await screen.findByTestId('ch-ngre-arbeitgeberName')
    expect(screen.queryByTestId('ch-ngre-arbeitgeber-auswahl')).toBeNull()
    expect(screen.queryByText(/Novartis/)).toBeNull()
  })

  it('preserves sequential employer field edits when earlier PUT refetches arrive mid-typing and saves identical Ziffer 1 + Ziffer 8', async () => {
    const nGreBodies: Array<Record<string, unknown>> = []
    const fieldBodies: Array<{ feld: string; body: unknown }> = []
    let current = EMPTY_CH
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
      http.get(CH_URL, () => HttpResponse.json(current, { status: 200 })),
      http.put(`${CH_URL}/n-gre`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        nGreBodies.push(body)
        current = { ...current, nGre: { ...current.nGre, ...body } }
        return HttpResponse.json(current, { status: 200 })
      }),
      http.put(`${CH_URL}/:feld`, async ({ params, request }) => {
        const body = await request.json()
        fieldBodies.push({ feld: String(params.feld), body })
        return HttpResponse.json(current, { status: 200 })
      }),
    )
    renderScreen()

    const lohn = await screen.findByTestId('ch-feld-lohn')
    const brutto = screen.getByTestId('ch-feld-bruttolohn-total')
    fireEvent.change(lohn, { target: { value: '110000' } })
    fireEvent.blur(lohn)
    fireEvent.change(brutto, { target: { value: '110000' } })
    fireEvent.blur(brutto)

    const name = screen.getByTestId('ch-ngre-arbeitgeberName')
    const strasse = screen.getByTestId('ch-ngre-arbeitgeberStrasse')
    const plzOrt = screen.getByTestId('ch-ngre-arbeitgeberPlzOrt')

    fireEvent.change(name, { target: { value: 'Basler Treuhand AG' } })
    fireEvent.blur(name)
    fireEvent.change(strasse, { target: { value: 'Steinenberg 5' } })
    fireEvent.blur(strasse)
    fireEvent.change(plzOrt, { target: { value: '4051 Basel' } })
    fireEvent.blur(plzOrt)

    await waitFor(() =>
      expect(fieldBodies).toEqual([
        { feld: 'lohn', body: { kind: 'erfasst', value: 110000 } },
        { feld: 'bruttolohn-total', body: { kind: 'erfasst', value: 110000 } },
      ]),
    )
    await waitFor(() =>
      expect(nGreBodies).toEqual([
        { arbeitgeberName: 'Basler Treuhand AG' },
        { arbeitgeberStrasse: 'Steinenberg 5' },
        { arbeitgeberPlzOrt: '4051 Basel' },
      ]),
    )
  })
})

// ADR-0097 §4: the Lohnausweis upload in the mask goes through the one pipeline — stored, read on the
// device, parsed with the mask's context — and says what came of it, instead of only storing the file.
describe('GrenzgaengerScreen — Lohnausweis upload reads the document', () => {
  it('stores the certificate, reads it with the mask as context and says that its values wait', async () => {
    const parseBodies: unknown[] = []
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json(DONE_CH_INTERVIEW, { status: 200 })),
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'rec-ch-1' }, { status: 201 })),
      http.post('*/v1/belege/parse', async ({ request }) => {
        parseBodies.push(await request.json())
        return HttpResponse.json(
          {
            mode: 'deterministic_fallback',
            securityBlocked: false,
            parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: TAX_YEAR },
            stagedAction: null,
            assistantMessage: null,
            draftsTaxYear: 2025,
            filedInTaxYear: 2025,
            noValuesReason: null,
            duplicateOf: null,
            processing: { state: 'vorschlaege', reason: null, pending: 4, applied: 0, dismissed: 0, draftsTaxYear: 2025, open: true },
          },
          { status: 200 },
        )
      }),
    )
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnausweis - Certificat de salaire 2025', usedOcrFallback: false, pagesProcessed: 1 })

    renderScreen()
    await screen.findByTestId('ch-lohnausweis-upload-card')
    expect(screen.getByText('Lohnausweis oder Gre-1 / Gre-2 hochladen')).toBeTruthy()
    const input = screen.getByTestId('ch-lohnausweis-upload-card').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'lohnausweis-2025.pdf', { type: 'application/pdf' })] } })

    expect((await screen.findByTestId('ch-lohnausweis-ergebnis-stand')).textContent).toBe('4 Werte warten auf dich')
    expect(screen.getByTestId('ch-lohnausweis-upload-status').textContent).toBe('lohnausweis-2025.pdf ist in deinen Belegen gespeichert.')
    expect(screen.getByTestId('ch-lohnausweis-ergebnis-jahr').textContent).toBe('Liegt im Steuerjahr 2025')
    expect(parseBodies).toEqual([expect.objectContaining({ receiptId: 'rec-ch-1', expectedKind: 'chLohnausweis', mask: 'chLohnausweis', area: 'A', stageDraft: true })])
  })
})
