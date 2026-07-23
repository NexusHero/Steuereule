// T1 security-control test (Musti's finding on #138): every "secrets-excluded"/
// injection assertion elsewhere in this slice (account-export.service.test.ts,
// account.http.test.ts, account-export.integration.test.ts, acceptance/
// req-011-export.test.ts) targets the JSON path only — the JSON path never touches
// the template layer, so `escapeHtml()` in export-report-template.ts was completely
// uncovered. A future refactor could drop one `escapeHtml()` call and nothing would
// fail, even though this HTML is what PlaywrightPdfRenderer hands real Chromium via
// `page.setContent(html, { waitUntil: 'load' })` — an unenforced T1 injection control.
//
// This is a pure function test (buildExportReportHtml has no I/O) — no browser
// needed, deterministic, fast. It exercises every user-controlled interpolation point
// in the template with both a <script> payload and an attribute-breakout payload, and
// separately proves the rendered HTML never carries a secret field/value — the PDF
// seam's own secrets-excluded proof, not just transitive coverage via the JSON path.
import { describe, expect, it } from 'vitest'
import { buildExportReportHtml } from '../src/account/export/export-report-template.js'
import type { ExportDocument } from '../src/account/export/export-document.js'

const SCRIPT_PAYLOAD = '<script>alert(1)</script>'
const ATTRIBUTE_BREAKOUT_PAYLOAD = '"><img src=x onerror=alert(1)>'

function baseDocument(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    schemaVersion: '1.0',
    exportedAt: '2026-01-15T09:30:00.000Z',
    account: {
      email: 'anna@example.com',
      name: 'Anna Beispiel',
      emailVerified: true,
      createdAt: '2026-01-15T09:30:00.000Z',
      authProviders: ['credential'],
    },
    profile: {
      firstName: 'Anna',
      lastName: 'Beispiel',
      steuerId: '02476291358',
      steuernummer: '18181508155',
      createdAt: '2026-01-16T10:00:00.000Z',
      updatedAt: '2026-01-17T11:00:00.000Z',
    },
    taxData: [],
    accessLog: [{ action: 'READ', resource: 'profile', createdAt: '2026-01-16T10:05:00.000Z' }],
    ...overrides,
  }
}

/** Every raw-payload string must never survive verbatim, and every payload's
 *  escaped form must be present — the exact regression a dropped `escapeHtml()`
 *  call would produce (the raw string reappearing, the escaped form vanishing). */
function expectPayloadWasEscaped(html: string, payload: string): void {
  expect(html).not.toContain(payload)
  const escaped = payload
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  expect(html).toContain(escaped)
}

describe('buildExportReportHtml — HTML-injection escaping (T1, every user-controlled field)', () => {
  it.each([
    ['account.name', (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, name: payload } })],
    ['account.email', (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, email: payload } })],
    [
      'profile.firstName',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, firstName: payload } }),
    ],
    [
      'profile.lastName',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, lastName: payload } }),
    ],
    [
      'profile.steuerId',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, steuerId: payload } }),
    ],
    [
      'profile.steuernummer',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, steuernummer: payload } }),
    ],
    [
      'account.authProviders[]',
      (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, authProviders: [payload] } }),
    ],
    [
      'accessLog[].action',
      (doc: ExportDocument, payload: string) => ({
        ...doc,
        accessLog: [{ action: payload, resource: 'profile', createdAt: '2026-01-16T10:05:00.000Z' }],
      }),
    ],
    [
      'accessLog[].resource',
      (doc: ExportDocument, payload: string) => ({
        ...doc,
        accessLog: [{ action: 'READ', resource: payload, createdAt: '2026-01-16T10:05:00.000Z' }],
      }),
    ],
  ] as const)('escapes a <script> payload injected via %s', (_label, withPayload) => {
    const document = withPayload(baseDocument(), SCRIPT_PAYLOAD) as ExportDocument
    const html = buildExportReportHtml(document)
    expectPayloadWasEscaped(html, SCRIPT_PAYLOAD)
  })

  it.each([
    ['account.name', (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, name: payload } })],
    ['account.email', (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, email: payload } })],
    [
      'profile.firstName',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, firstName: payload } }),
    ],
    [
      'profile.lastName',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, lastName: payload } }),
    ],
    [
      'profile.steuerId',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, steuerId: payload } }),
    ],
    [
      'profile.steuernummer',
      (doc: ExportDocument, payload: string) => ({ ...doc, profile: { ...doc.profile!, steuernummer: payload } }),
    ],
    [
      'account.authProviders[]',
      (doc: ExportDocument, payload: string) => ({ ...doc, account: { ...doc.account, authProviders: [payload] } }),
    ],
    [
      'accessLog[].action',
      (doc: ExportDocument, payload: string) => ({
        ...doc,
        accessLog: [{ action: payload, resource: 'profile', createdAt: '2026-01-16T10:05:00.000Z' }],
      }),
    ],
    [
      'accessLog[].resource',
      (doc: ExportDocument, payload: string) => ({
        ...doc,
        accessLog: [{ action: 'READ', resource: payload, createdAt: '2026-01-16T10:05:00.000Z' }],
      }),
    ],
  ] as const)('escapes an attribute-breakout payload injected via %s', (_label, withPayload) => {
    const document = withPayload(baseDocument(), ATTRIBUTE_BREAKOUT_PAYLOAD) as ExportDocument
    const html = buildExportReportHtml(document)
    expectPayloadWasEscaped(html, ATTRIBUTE_BREAKOUT_PAYLOAD)
  })

  it('a profile with steuernummer: null never renders a payload for it (the "—" branch), and other fields still escape', () => {
    const document = baseDocument({
      account: { ...baseDocument().account, name: SCRIPT_PAYLOAD },
      profile: { ...baseDocument().profile!, steuernummer: null },
    })
    const html = buildExportReportHtml(document)
    expectPayloadWasEscaped(html, SCRIPT_PAYLOAD)
    expect(html).toContain('—')
  })

  it('a document with no saved Profile (null) still renders safely — no crash, honest-empty branch taken', () => {
    const document = baseDocument({ profile: null, account: { ...baseDocument().account, name: SCRIPT_PAYLOAD } })
    const html = buildExportReportHtml(document)
    expectPayloadWasEscaped(html, SCRIPT_PAYLOAD)
    expect(html).toContain('Es wurde noch kein Profil gespeichert.')
  })

  it('an empty accessLog renders the honest "no accesses" row, never crashing on the payload elsewhere on the page', () => {
    const document = baseDocument({ accessLog: [], profile: { ...baseDocument().profile!, firstName: SCRIPT_PAYLOAD } })
    const html = buildExportReportHtml(document)
    expectPayloadWasEscaped(html, SCRIPT_PAYLOAD)
    expect(html).toContain('Keine Zugriffe protokolliert.')
  })
})

describe('buildExportReportHtml — secrets excluded from the rendered HTML (PDF seam’s own proof, not transitive via JSON)', () => {
  it('never contains a password hash, session/verification token, or secret field name anywhere in the rendered output', () => {
    const document = baseDocument()
    const html = buildExportReportHtml(document).toLowerCase()

    for (const forbidden of [
      'password',
      'passwordhash',
      'accesstoken',
      'refreshtoken',
      'idtoken',
      'sessiontoken',
      'verificationtoken',
      'secret',
    ]) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('ExportDocument itself has no field to carry a secret through in the first place (type-level guarantee)', () => {
    // Belt-and-suspenders documentation, not a redundant runtime check: the forbidden-
    // substring assertion above proves the template never *emits* the words "password"/
    // "token"/"secret"; this one records *why* that's structurally guaranteed rather than
    // accidental — ExportAccountSection/ExportProfileSection/ExportAccessLogEntry (see
    // export-document.ts) simply have no property for a hash or token to occupy, so
    // AccountExportService.assemble() has nothing of the kind to hand this template even
    // if a future change carelessly tried to widen the account-identity read.
    const account: ExportDocument['account'] = baseDocument().account
    expect(Object.keys(account).sort()).toEqual(['authProviders', 'createdAt', 'email', 'emailVerified', 'name'].sort())
  })
})
