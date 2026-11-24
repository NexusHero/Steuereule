import { describe, expect, it } from 'vitest'
import { HOSTING, MODEL_PROVIDERS, RETENTION } from '@steuereule/core'
import { privacy } from './texts'

// The privacy policy prints its periods and recipients from @steuereule/core, the module the API's lock
// test (apps/api/test/product-limits.lock.test.ts) keeps equal to what the code enforces (P9).
const text = privacy(null)
  .flatMap((s) => [s.title, ...s.paragraphs])
  .join('\n')

describe('privacy policy: recipients', () => {
  it('names the hosting provider, its region and country, and its logging services (WEB-27, H2-43)', () => {
    expect(text).toContain(`${HOSTING.provider} (Google) als Auftragsverarbeiter in der Region ${HOSTING.region} (${HOSTING.country})`)
    expect(text).toContain('Google Cloud Logging und Google Cloud Error Reporting')
    expect(text).not.toContain('Rechenzentrumsanbieter')
  })

  it('names every model provider the API can call, with its country, for chat, guard and document reading (LEGAL-1, LEGAL-2, API-11)', () => {
    for (const p of MODEL_PROVIDERS) expect(text).toContain(`${p.company} (${p.product}, ${p.country})`)
    expect(text).toContain('Sprachmodelle (Eule, Themenprüfung, Auslesen von Dokumenten)')
    expect(text).toContain('Die Einwilligung gilt für jeden unter 4. genannten Modellanbieter')
    expect(text).toContain('auch außerhalb des Chats, an ein Sprachmodell')
  })

  it('says the turbo mode writes by itself (LEGAL-3)', () => {
    expect(text).toContain('Turbo-Modus')
    expect(text).toContain('übernimmt die Eule ihre Änderungen selbst')
  })

  it('names the other people whose data the return holds (LEGAL-5)', () => {
    for (const who of ['kein eigenes Konto hat', 'über deine Kinder', 'über den anderen Elternteil', 'über deinen Arbeitgeber']) expect(text).toContain(who)
  })

  it('does not claim that every single read is logged', () => {
    expect(text).not.toContain('Jeder Lese- und Schreibzugriff')
    expect(text).toContain('Lese- und Schreibzugriffe auf deine Steuerdaten protokollieren wir')
  })
})

describe('privacy policy: retention (LEGAL-4)', () => {
  it('prints each period from the shared constants', () => {
    expect(text).toContain(`als Gast ${RETENTION.guestDataDays} Tage lang nichts`)
    expect(text).toContain(`Gast-Cookie läuft nach ${RETENTION.guestCookieDays} Tage ab`)
    expect(text).toContain(`${RETENTION.sessionIdleDays} Tage nach ihrer letzten Nutzung, spätestens ${RETENTION.sessionAbsoluteDays} Tage nach der Anmeldung`)
    expect(text).toContain(`die letzten ${RETENTION.databaseBackups} Sicherungen`)
    expect(text).toContain(`der letzten ${RETENTION.databasePitrDays} Tage`)
    expect(text).toContain(`${RETENTION.keystoreBackups} Sicherungen und ${RETENTION.keystorePitrDays === 1 ? '1 Tag' : `${RETENTION.keystorePitrDays} Tage`}`)
    expect(text).toContain(`${RETENTION.legalHoldPaymentYears} Jahre ab Ende des Zahlungsjahres`)
    expect(text).toContain(`${RETENTION.legalHoldFilingVersionYears} Jahre ab Ende des Jahres der Einreichung`)
    expect(text).toContain('anonymisierten Einträge bewahren wir ohne feste Frist')
  })

  it('states no period that the shared constants do not hold', () => {
    const allowed = new Set<number>([...Object.values(RETENTION), 30 /* Cloud Logging default */])
    const printed = [...text.matchAll(/(\d+) (?:Tage|Tag|Jahre|Sicherungen)\b/g)].map((m) => Number(m[1]))
    expect(printed.filter((n) => !allowed.has(n))).toEqual([])
  })
})
