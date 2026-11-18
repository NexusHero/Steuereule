import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { buildTestApp } from './support/build-test-app.js'

// ADR-0097 — every Beleg says what became of it. The contract: whatever a batch upload holds, each Beleg
// ends in a defined processing state, and `open` is exactly „not yet fully processed“.

const COOKIE = { cookie: 'better-auth.session_token=tok-lifecycle' }
const YEAR = 2025

function multipart(fileName: string, payload: Buffer) {
  const boundary = '----SteuereuleLifecycleBoundary'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
    payload,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ])
  return { body, headers: { ...COOKIE, 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

/** A distinct small PDF per name, so only the deliberate duplicate shares its content. */
const pdf = (marker: string) => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj\n<<>>\nendobj\n`, 'utf8')

const DONATION_2025 = 'Spende an das DRK, gemeinnützig. Betrag der Zuwendung 250,00 EUR. Datum der Zuwendung 10.05.2025'
const DONATION_2024 = 'Spende an die Caritas, gemeinnützig. Betrag der Zuwendung 120,00 EUR. Datum der Zuwendung 03.03.2024'
const GROCERIES = 'Supermarkt Kassenbon Brot Milch 7,40 EUR 12.06.2025'

interface Receipt {
  id: string
  belegdatum: string | null
  processing: { state: string; reason: string | null; pending: number; applied: number; draftsTaxYear: number | null; open: boolean }
  filledFields: { field: string; value: string; taxYear: number; label: string }[]
  duplicateOf: { id: string; fileName: string; uploadedAt: string } | null
}

describe('Beleg lifecycle contract (ADR-0097)', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    app = (await buildTestApp({ sessionsByToken: { 'tok-lifecycle': 'user-lifecycle' } })).app
  })

  afterEach(async () => {
    await app.close()
  })

  async function upload(fileName: string, bytes: Buffer): Promise<Receipt> {
    const { body, headers } = multipart(fileName, bytes)
    const res = await app.inject({ method: 'POST', url: '/v1/belege/upload', headers, payload: body })
    expect(res.statusCode).toBe(201)
    return res.json() as Receipt
  }

  async function parse(payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: '/v1/belege/parse', headers: COOKIE, payload: { taxYear: YEAR, fileName: 'beleg.pdf', textSource: 'pdf_text', ...payload } })
    expect(res.statusCode).toBe(200)
    return res.json() as { filedInTaxYear: number | null; draftsTaxYear: number | null; duplicateOf: Receipt['duplicateOf']; processing: Receipt['processing'] | null; stagedAction: { actionId: string } | null }
  }

  async function inbox(): Promise<Map<string, Receipt>> {
    const res = await app.inject({ method: 'GET', url: '/v1/belege', headers: COOKIE })
    expect(res.statusCode).toBe(200)
    return new Map((res.json() as Receipt[]).map((r) => [r.id, r]))
  }

  it('walks a batch: every Beleg ends in a defined state, and open follows it', async () => {
    const withValues = await upload('spende-drk.pdf', pdf('drk'))
    const nothing = await upload('kassenbon.pdf', pdf('bon'))
    const otherYear = await upload('spende-caritas.pdf', pdf('caritas'))
    const unreadable = await upload('scan.pdf', pdf('scan'))
    const duplicate = await upload('spende-drk-nochmal.pdf', pdf('drk'))

    // Before anything is read every Beleg is new, and open.
    for (const receipt of [withValues, nothing, otherYear, unreadable]) expect(receipt.processing).toMatchObject({ state: 'neu', open: true })
    expect(withValues.duplicateOf).toBeNull()
    expect(duplicate.duplicateOf).toMatchObject({ id: withValues.id, fileName: 'spende-drk.pdf' })

    const read = await parse({ receiptId: withValues.id, rawText: DONATION_2025 })
    expect(read.processing).toMatchObject({ state: 'vorschlaege', pending: 1, draftsTaxYear: YEAR, open: true })
    expect(read.filedInTaxYear).toBeNull()

    expect((await parse({ receiptId: nothing.id, rawText: GROCERIES })).processing).toMatchObject({ state: 'nichts_verwertbar', reason: 'nichts_erkannt', open: false })

    const elsewhere = await parse({ receiptId: otherYear.id, rawText: DONATION_2024 })
    expect(elsewhere.filedInTaxYear).toBe(2024)
    expect(elsewhere.processing).toMatchObject({ state: 'vorschlaege', draftsTaxYear: 2024, open: true })

    expect((await parse({ receiptId: unreadable.id, deviceReadFailure: 'empty_text' })).processing).toMatchObject({ state: 'nicht_lesbar', reason: 'kein_text', open: true })

    const again = await parse({ receiptId: duplicate.id, rawText: DONATION_2025 })
    expect(again.duplicateOf?.id).toBe(withValues.id)
    expect(again.stagedAction).toBeNull()
    expect(again.processing).toMatchObject({ state: 'nichts_verwertbar', reason: 'dublette', open: false })

    // Taking the donation over finishes that Beleg; the inbox says which field it filled.
    const apply = await app.inject({ method: 'POST', url: `/v1/steuerjahre/${YEAR}/advisor/actions/${read.stagedAction!.actionId}/apply`, headers: COOKIE })
    expect(apply.statusCode).toBe(200)

    const after = await inbox()
    expect(after.size).toBe(5)
    expect(after.get(withValues.id)).toMatchObject({ processing: { state: 'uebernommen', applied: 1, open: false }, assignment: { kind: 'zugeordnet', taxYear: YEAR }, belegdatum: null })
    expect(after.get(withValues.id)?.filledFields).toEqual([expect.objectContaining({ field: 'spenden-betrag', value: '250', taxYear: YEAR })])
    expect(after.get(otherYear.id)).toMatchObject({ processing: { state: 'vorschlaege', draftsTaxYear: 2024, open: true }, assignment: { kind: 'zugeordnet', taxYear: 2024 }, belegdatum: null })
    expect(after.get(nothing.id)?.processing).toMatchObject({ state: 'nichts_verwertbar', open: false })
    expect(after.get(unreadable.id)?.processing).toMatchObject({ state: 'nicht_lesbar', open: true })
    expect(after.get(duplicate.id)).toMatchObject({ processing: { state: 'nichts_verwertbar', open: false }, duplicateOf: { id: withValues.id } })
    // „N offen“ counts exactly the Belege not yet fully processed.
    expect([...after.values()].filter((r) => r.processing.open).map((r) => r.id).sort()).toEqual([otherYear.id, unreadable.id].sort())
  })

  it('a duplicate is read again on request', async () => {
    const first = await upload('a.pdf', pdf('same'))
    const second = await upload('b.pdf', pdf('same'))
    await parse({ receiptId: first.id, rawText: DONATION_2025 })
    const forced = await parse({ receiptId: second.id, rawText: DONATION_2025, allowDuplicate: true })
    expect(forced.stagedAction).not.toBeNull()
    expect(forced.processing?.state).toBe('vorschlaege')
  })

  it('deletes a Beleg with its values when asked, and leaves them without the option', async () => {
    const kept = await upload('kept.pdf', pdf('kept'))
    const gone = await upload('gone.pdf', pdf('gone'))
    for (const receipt of [kept, gone]) {
      const { stagedAction } = await parse({ receiptId: receipt.id, rawText: DONATION_2025 })
      await app.inject({ method: 'POST', url: `/v1/steuerjahre/${YEAR}/advisor/actions/${stagedAction!.actionId}/apply`, headers: COOKIE })
    }

    const plain = await app.inject({ method: 'DELETE', url: `/v1/belege/${kept.id}`, headers: COOKIE })
    expect(plain.json()).toEqual({ deleted: true, takenBack: 0, withdrawn: 0 })

    const withValues = await app.inject({ method: 'DELETE', url: `/v1/belege/${gone.id}?takeBackValues=true`, headers: COOKIE })
    expect(withValues.json()).toEqual({ deleted: true, takenBack: 1, withdrawn: 0 })

    const invalid = await app.inject({ method: 'DELETE', url: `/v1/belege/${gone.id}?takeBackValues=yes`, headers: COOKIE })
    expect(invalid.statusCode).toBe(400)
  })

  it('a mask’s expected document is read by its reader even when the text alone does not say it', async () => {
    const receipt = await upload('lstb.pdf', pdf('lstb'))
    const res = await app.inject({
      method: 'POST',
      url: '/v1/belege/parse',
      headers: COOKIE,
      payload: { taxYear: YEAR, fileName: 'lstb.pdf', receiptId: receipt.id, mask: 'lstb', rawText: '3. 50.000,00\n4. 9.000,00', textSource: 'pdf_text' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().lstb).toBeTruthy()
  })

  it('names why nothing was proposed: an order confirmation is no invoice', async () => {
    const receipt = await upload('ab.pdf', pdf('ab'))
    const confirmation = [
      'Beispiel Elektro GmbH',
      'Auftragsbestätigung AB-118, Datum 03.09.2025',
      'Pos Menge Einh. Bezeichnung E-Preis/EUR Gesamt/EUR',
      '1 10,50 Std. 2 x An- und Abfahrt, sowie Teilmontage und Wiedermontage 70,00 735,00',
      'Gesamtbetrag inkl. Steuer EUR 981,75',
    ].join('\n')
    const res = await parse({ receiptId: receipt.id, rawText: confirmation })
    expect(res.processing).toMatchObject({ state: 'nichts_verwertbar', reason: 'keine_rechnung', open: false })
  })

  it('refuses a device failure without the stored Beleg', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/belege/parse', headers: COOKIE, payload: { taxYear: YEAR, fileName: 'x.pdf', deviceReadFailure: 'read_failed' } })
    expect(res.statusCode).toBe(400)
  })
})
