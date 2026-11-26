// The Strom's own pages (ADR-0089): the basis page, the selection page and a topic page. Each one
// answers through the same interview endpoint as the catalogues, in the order the server admits.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Answers } from '@steuereule/core'
import { server } from '../../../test/test-msw-server'
import { AuswahlPage, BasisPage, TopicPage } from './StromPages'
import { effectOf, forgetEffects } from './stromEffects'
import { renderWithQuery } from '../../../test/test-render'

const YEAR = 2025
const BASIS: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

function wrap(ui: React.ReactElement) {
  return renderWithQuery(ui)
}

/** Records every answer the page sends, in order. */
function recordPosts(): { readonly questionId: string; readonly value: string }[] {
  const posts: { questionId: string; value: string }[] = []
  server.use(
    http.post(`*/v1/steuerjahre/${YEAR}/interview/antworten`, async ({ request }) => {
      posts.push((await request.json()) as { questionId: string; value: string })
      return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
    }),
  )
  return posts
}

beforeEach(() => forgetEffects())

describe('the basis page', () => {
  it('asks only what branches, on one page, and sends it top-down on Weiter', async () => {
    const posts = recordPosts()
    const onSaved = vi.fn()
    wrap(<BasisPage taxYear={YEAR} stored={{}} onSaved={onSaved} />)

    fireEvent.click(screen.getByTestId('interview-option-job-Beides'))
    // Self-employment on the side is a notice in place, not a page of its own.
    expect(screen.getByTestId('strom-hinweis-gewerbe')).toBeTruthy()
    fireEvent.click(screen.getByTestId('interview-option-ausland-Nein'))
    fireEvent.click(screen.getByTestId('interview-option-kinder-1 Kind'))
    fireEvent.click(screen.getByTestId('interview-option-familienstand-Verheiratet'))
    // Married: what the partner does joins the same page (ADR-0088).
    fireEvent.click(screen.getByTestId('interview-option-partner-job-Rente'))
    fireEvent.click(screen.getByTestId('strom-weiter'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts.map((p) => `${p.questionId}=${p.value}`)).toEqual([
      'job=Beides',
      'gewerbe=weiter',
      'ausland=Nein',
      'kinder=1 Kind',
      'familienstand=Verheiratet',
      'partner-job=Rente',
    ])
  })

  it('names what is still missing instead of sending half a page', async () => {
    const posts = recordPosts()
    wrap(<BasisPage taxYear={YEAR} stored={{}} onSaved={() => {}} />)
    fireEvent.click(screen.getByTestId('interview-option-job-Angestellt'))
    fireEvent.click(screen.getByTestId('strom-weiter'))
    expect(await screen.findByTestId('strom-fehlt-ausland')).toBeTruthy()
    expect(posts).toEqual([])
  })
})

describe('the selection page', () => {
  it('shows every topic on one page and sends Ja for the chosen, Nein for the rest', async () => {
    const posts = recordPosts()
    const onSaved = vi.fn()
    wrap(<AuswahlPage taxYear={YEAR} stored={BASIS} onSaved={onSaved} />)

    expect(screen.getByText('Was trifft 2025 auf dich zu?')).toBeTruthy()
    fireEvent.click(screen.getByTestId('strom-thema-spenden'))
    fireEvent.click(screen.getByTestId('strom-thema-kv-pv'))
    expect(screen.getByTestId('strom-weiter').textContent).toContain('Weiter mit 2 Themen')
    fireEvent.click(screen.getByTestId('strom-weiter'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts).toContainEqual({ questionId: 'spenden', value: 'Ja' })
    expect(posts).toContainEqual({ questionId: 'kv-pv', value: 'Ja' })
    expect(posts).toContainEqual({ questionId: 'umzug', value: 'Nein' })
    expect(posts.some((p) => p.questionId === 'vorauszahlungen-gate' && p.value === 'Nein')).toBe(true)
  })

  it('keeps rare topics behind "Mehr anzeigen"', () => {
    recordPosts()
    wrap(<AuswahlPage taxYear={YEAR} stored={BASIS} onSaved={() => {}} />)
    expect(screen.queryByTestId('strom-thema-abfindung')).toBeNull()
    fireEvent.click(screen.getByTestId('strom-mehr'))
    expect(screen.getByTestId('strom-thema-abfindung')).toBeTruthy()
  })

  it('asks the kind of a side job right there', async () => {
    const posts = recordPosts()
    const onSaved = vi.fn()
    wrap(<AuswahlPage taxYear={YEAR} stored={BASIS} onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('strom-thema-nebenjob'))
    fireEvent.click(screen.getByTestId('strom-weiter'))
    expect(await screen.findByTestId('strom-fehlt-art-nebenjob')).toBeTruthy()
    fireEvent.click(screen.getByTestId('strom-art-nebenjob-Midijob'))
    fireEvent.click(screen.getByTestId('strom-weiter'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts).toContainEqual({ questionId: 'nebenjob', value: 'Midijob' })
  })

  it('asks before leaving out a topic that already holds an amount, and keeps it on "Doch behalten"', async () => {
    const posts = recordPosts()
    const onSaved = vi.fn()
    wrap(<AuswahlPage taxYear={YEAR} stored={{ ...BASIS, spenden: 'Ja', 'spenden-betrag': '300' }} onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('strom-thema-spenden'))
    fireEvent.click(screen.getByTestId('strom-weiter'))
    expect(await screen.findByTestId('strom-abwaehlen')).toBeTruthy()
    fireEvent.click(screen.getByTestId('strom-abwaehlen-nein'))
    expect(posts).toEqual([])
    fireEvent.click(screen.getByTestId('strom-weiter'))
    fireEvent.click(await screen.findByTestId('strom-abwaehlen-ja'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts).toContainEqual({ questionId: 'spenden', value: 'Nein' })
  })
})

describe('a topic page', () => {
  function estimateOf(from: number) {
    return HttpResponse.json({ kind: 'spanne', result: { from, to: from } }, { status: 200 })
  }

  it('shows all amounts of the topic together and remembers what the page changed in the estimate', async () => {
    const posts = recordPosts()
    let refund = 500
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/steuerschaetzung`, () => estimateOf(refund)))
    const onSaved = vi.fn(() => {})
    wrap(<TopicPage taxYear={YEAR} stored={{ ...BASIS, 'kv-pv': 'Ja' }} prior={{}} topic="kv-pv" slug="krankenversicherung" onSaved={onSaved} />)

    expect(screen.getByTestId('katalog-input-kv-pv-betrag')).toBeTruthy()
    expect(screen.getByTestId('katalog-input-pv-betrag')).toBeTruthy()
    expect(screen.getByTestId('katalog-input-kv-wahl-betrag')).toBeTruthy()
    expect(screen.getByTestId('strom-wirkungszeile').textContent).toContain('Anlage Vorsorgeaufwand')

    fireEvent.click(screen.getByTestId('katalog-option-kv-pv-art-Privat'))
    fireEvent.change(screen.getByTestId('katalog-input-kv-pv-betrag'), { target: { value: '4200' } })
    fireEvent.change(screen.getByTestId('katalog-input-pv-betrag'), { target: { value: '600' } })
    fireEvent.change(screen.getByTestId('katalog-input-kv-wahl-betrag'), { target: { value: '0' } })
    server.use(
      http.post(`*/v1/steuerjahre/${YEAR}/interview/antworten`, async ({ request }) => {
        posts.push((await request.json()) as { questionId: string; value: string })
        refund = 1340
        return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
      }),
    )
    fireEvent.click(screen.getByTestId('strom-weiter'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts.map((p) => p.questionId)).toEqual(['kv-pv-art', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag'])
    expect(effectOf(YEAR, 'krankenversicherung')).toBe(840)
  })

  it('"Später" marks the amounts that may wait and moves on', async () => {
    const posts = recordPosts()
    const onSaved = vi.fn()
    wrap(<TopicPage taxYear={YEAR} stored={{ ...BASIS, spenden: 'Ja' }} prior={{}} topic="spenden" slug="spenden" onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('strom-spaeter'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts).toEqual([{ questionId: 'spenden-betrag', value: 'spaeter' }])
  })

  it('offers last year’s donation with one tap', () => {
    recordPosts()
    wrap(<TopicPage taxYear={YEAR} stored={{ ...BASIS, spenden: 'Ja' }} prior={{ 'spenden-betrag': '250' }} topic="spenden" slug="spenden" onSaved={() => {}} />)
    fireEvent.click(screen.getByTestId('wie-vorjahr-spenden-betrag'))
    expect((screen.getByTestId('katalog-input-spenden-betrag') as HTMLInputElement).value).toBe('250')
  })
})
