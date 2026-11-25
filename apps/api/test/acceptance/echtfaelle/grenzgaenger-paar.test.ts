// Acceptance on a real case (see grenzgaenger-paar.case.ts): the documents go through the app's own
// readers (POST /v1/belege/parse), their drafts are taken over as a user does (apply-batch), the
// remaining answers are written as values the user confirmed, and the app's own estimate must hit the
// target: the notice with the researched corrections, plus the app's known deviations, to the cent.
// Real Postgres, real HTTP against `buildApp()`.
import { provenanceKey } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { app, baseUrl, signUp, useAcceptanceServer } from '../../support/acceptance-server.js'
import { GRENZGAENGER_PAAR, type CaseYear, type Document } from './grenzgaenger-paar.case.js'
import { runAsDatabaseUser } from '../../../src/common/database-identity.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'

interface Estimate {
  readonly kind: string
  readonly taxableIncome: { readonly from: number; readonly to: number }
  readonly result: { readonly from: number; readonly to: number }
  readonly [key: string]: unknown
}

describe('Echtfall: Grenzgänger-Ehepaar mit Kind, 2024 und 2025 (ADR-0094)', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'echtfall-grenzgaenger-secret',
      BETTER_AUTH_SECRET: 'echtfall-grenzgaenger-better-auth-secret-0123',
      BETTER_AUTH_URL: 'http://127.0.0.1:39971',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    // Each case signs up its own account; the suite leaves its rows to the database of the run.
    cleanup: async () => {},
  })

  async function call(cookie: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { cookie, origin: ALLOWED_ORIGIN, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    expect(res.status, `${method} ${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
    return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
  }

  /** Uploads one document's text, takes the drafts it stages over, and picks the daily-benefit path the case names. */
  async function upload(cookie: string, year: number, doc: Document): Promise<void> {
    const res = await call(cookie, 'POST', '/v1/belege/parse', { taxYear: year, fileName: doc.fileName, rawText: doc.text, kind: doc.kind, person: doc.person, area: doc.person, textSource: 'pdf_text' })
    const read = (res[doc.kind] ?? {}) as { stagedActionIds?: string[] }
    const meta = (res.assistantMessage as { meta?: { twoPaths?: { safePath: { actionId: string }; maxPath: { actionId: string } } } } | null)?.meta
    const drafts = [...(read.stagedActionIds ?? [])]
    if (doc.dailyBenefitPath && meta?.twoPaths) drafts.push(doc.dailyBenefitPath === 'max' ? meta.twoPaths.maxPath.actionId : meta.twoPaths.safePath.actionId)
    expect(drafts.length, `${doc.fileName}: no drafts staged`).toBeGreaterThan(0)
    await call(cookie, 'POST', `/v1/steuerjahre/${year}/advisor/actions/apply-batch`, { drafts: drafts.map((actionId) => ({ actionId })) })
  }

  async function runYear(c: CaseYear): Promise<Estimate> {
    const { cookie, userId } = await signUp(`echtfall-${c.year}-${Date.now()}@example.com`)
    const y = c.year
    await call(cookie, 'PUT', '/v1/profile', GRENZGAENGER_PAAR.personA).catch(() => undefined)
    await call(cookie, 'PUT', `/v1/steuerjahre/${y}/kopplung`, { filingType: 'zusammen' })
    await call(cookie, 'PUT', `/v1/steuerjahre/${y}/kopplung/person-b`, GRENZGAENGER_PAAR.personB)
    const children = (await call(cookie, 'POST', `/v1/steuerjahre/${y}/kinder`, { firstName: c.child.firstName, lastName: c.child.lastName, geburtsdatum: c.child.birthDate })) as { kinder: Array<{ id: string }> }
    const child = children.kinder[0]!

    const { ConfirmationService } = await import('../../../src/confirmation/confirmation.service.js')
    const { LinkService } = await import('../../../src/link/link.service.js')
    const confirmation = app.get(ConfirmationService)
    // Called as the owl's requests call them: as Person A (P11). A records Person B's figures under B's shadow id.
    const asA = <T>(work: () => Promise<T>) => runAsDatabaseUser(userId, work)
    const spouse = await asA(() => app.get(LinkService).spouseForAdvisor(userId, y))
    expect(spouse, 'Person B is linked').not.toBeNull()

    // The interview first: it opens the masks the documents and the answers fill.
    const household = (answer: CaseYear['answers'][number]) => answer.screen === 'interview' && !answer.person
    for (const a of c.answers.filter(household)) {
      await asA(() => confirmation.writeConfirmedByAdvisor(userId, y, provenanceKey('interview', a.field), a.value, undefined, { kind: 'nutzer' }, { personalDataConsent: true }))
    }
    for (const doc of c.documents) await upload(cookie, y, doc)
    for (const a of c.answers.filter((answer) => !household(answer))) {
      const dataUserId = a.person === 'B' ? spouse!.spouseUserId : userId
      const key = provenanceKey(a.screen as never, a.field, a.child ? child.id : undefined)
      await asA(() => confirmation.writeConfirmedByAdvisor(dataUserId, y, key, a.value, undefined, { kind: 'nutzer' }, { personalDataConsent: true }))
    }
    return (await call(cookie, 'GET', `/v1/steuerjahre/${y}/steuerschaetzung`)) as unknown as Estimate
  }

  for (const c of GRENZGAENGER_PAAR.years) {
    it(`${c.year}: the estimate is the target (notice ${c.notice.resultAfterPrepayments} € with ${c.corrections.length} corrections) plus the app’s known deviations`, async () => {
      const estimate = await runYear(c)
      const expected = Math.round((c.target.resultAfterPrepayments + c.appDeviations.reduce((sum, d) => sum + d.resultEur, 0)) * 100) / 100
      // Printed on purpose: a miss is read line by line against the notice.
      console.log(`[echtfall ${c.year}]`, JSON.stringify(estimate))
      expect(estimate.kind).toBe('spanne')
      const zvE = c.target.taxableIncome + c.appDeviations.reduce((sum, d) => sum + d.taxableIncomeEur, 0)
      expect(estimate.taxableIncome).toEqual({ from: zvE, to: zvE })
      expect(Math.round(estimate.result.from * 100) / 100).toBe(expected)
      expect(estimate.result.to).toBe(estimate.result.from)
    })
  }
})
