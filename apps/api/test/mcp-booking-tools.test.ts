// #549, ADR-0052 amendment 6: the user's assistant drafts a booking; it waits on "Prüfen & bestätigen" as a
// proposal and is posted only when the user takes it there. Nothing is booked by the assistant.
import { beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { bookingFieldAccess } from '../src/business/booking-field-access.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import type { FieldAccess } from '../src/confirmation/field-access.js'
import type { AssistantSessionInfo, McpDeps } from '../src/mcp/mcp-session.js'
import { registerBookingTools } from '../src/mcp/tools/booking-tools.js'
import { registerEntryTools } from '../src/mcp/tools/entry-tools.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'

const USER = 'user-booking'
const YEAR = 2025
const CLAUDE: AssistantSessionInfo = { clientId: 'client-claude', clientName: 'Claude', scopes: ['steuerdaten:read', 'steuerdaten:write'] }

const draft = (over: Record<string, unknown> = {}) => ({
  taxYear: YEAR,
  label: 'Büromaterial buchen',
  reason: 'Beleg vom Nutzer',
  date: '2025-05-02',
  documentNumber: 'Q-17',
  text: 'Büromaterial',
  lines: [
    { account: '4930', side: 'debit', amount: 11900, taxKey: 'vst19' },
    { account: '1200', side: 'credit', amount: 11900 },
  ],
  ...over,
})

const text = (res: unknown): string => (res as { content: { text: string }[] }).content[0]?.text ?? ''
const parsed = (res: unknown) => JSON.parse(text(res)) as Record<string, any>

describe('booking drafts over MCP (#549)', () => {
  let posted: { draftRef: string; value: string | null }[]
  let hasBook: boolean
  let confirmation: ConfirmationService
  let audit: FakeAuditRepository

  const business = {
    digest: async () => (hasBook ? { profitSoFarEur: 0, vatBalanceEur: null, openBankItems: 0, mode: 'euer' as const, kind: 'freiberuf' } : null),
    bookingTarget: async () => ({ chart: 'SKR03' as const, mode: 'euer' as const, year: YEAR, lockedThrough: '2025-03-31', smallBusiness: false }),
    acceptedDraft: async (_u: string, _y: number, _ref: unknown, draftRef: string) => posted.find((p) => p.draftRef === draftRef)?.value ?? null,
    applyDraft: async (_u: string, _y: number, _ref: unknown, draftRef: string, value: string | null) => {
      posted.push({ draftRef, value })
    },
  }

  async function connect(assistant: AssistantSessionInfo = CLAUDE) {
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const auditService = new AuditService(audit)
    const deps = { confirmation, audit: auditService, business } as unknown as McpDeps
    registerBookingTools({ server, userId: USER, assistant }, deps)
    registerEntryTools({ server, userId: USER, assistant }, deps)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    return client
  }

  beforeEach(() => {
    posted = []
    hasBook = true
    audit = new FakeAuditRepository()
    const access = { buchung: bookingFieldAccess(business as never) } as unknown as FieldAccess
    confirmation = new ConfirmationService(new FakeMarkingRepository(), access, new AuditService(audit))
  })

  it('files a checked draft as an open proposal on buchung:<entwurf>.entry with the assistant as its source, and posts nothing', async () => {
    const client = await connect()
    const res = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))
    expect(res).toMatchObject({ ok: true, ergebnis: 'vorschlag' })
    expect(res.entwurf).toMatch(/^entwurf-/)
    expect(posted).toEqual([])

    const open = (await confirmation.list(USER, YEAR)).find((m) => m.key === `buchung:${res.entwurf}.entry`)
    expect(open?.proposal?.provenance).toEqual({ kind: 'assistent', name: 'Claude', clientId: 'client-claude' })
    expect(JSON.parse(open!.proposal!.value!)).toMatchObject({ documentNumber: 'Q-17', lines: [{ account: '4930' }, { account: '1200' }] })
    const overview = await confirmation.overview(USER, YEAR)
    expect(overview.annexes.find((a) => a.annex === 'anlageEuer')?.values[0]).toMatchObject({ screen: 'buchung', field: 'entry', proposal: { provenance: { kind: 'assistent', name: 'Claude' } } })
  })

  it('posts the draft only when the user takes the proposal in the app', async () => {
    const client = await connect()
    const { entwurf } = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))
    await confirmation.decideProposal(USER, YEAR, `buchung:${entwurf}.entry`, 'annehmen')
    expect(posted).toHaveLength(1)
    expect(posted[0]?.draftRef).toBe(entwurf)
    expect(JSON.parse(posted[0]!.value!)).toMatchObject({ documentNumber: 'Q-17' })
  })

  it.each([
    ['an account the chart does not have', { lines: [{ account: '9999', side: 'debit', amount: 100 }, { account: '1200', side: 'credit', amount: 100 }] }, 'UNKNOWN_ACCOUNT'],
    ['unbalanced amounts', { lines: [{ account: '4930', side: 'debit', amount: 100 }, { account: '1200', side: 'credit', amount: 90 }] }, 'UNBALANCED'],
    ['a locked period', { date: '2025-02-01' }, 'PERIOD_LOCKED'],
    ['another year', { date: '2024-12-30' }, 'WRONG_YEAR'],
    ['an unknown tax key', { lines: [{ account: '4930', side: 'debit', amount: 100, taxKey: 'vst16' }, { account: '1200', side: 'credit', amount: 100 }] }, 'INVALID_BOOKING'],
  ])('refuses %s, as the in-app advisor does, and files nothing', async (_label, over, code) => {
    const client = await connect()
    const res = await client.callTool({ name: 'buchung_entwerfen', arguments: draft(over) })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(text(res)).toContain(code)
    expect(await confirmation.list(USER, YEAR)).toEqual([])
  })

  it('refuses without a book for the year', async () => {
    hasBook = false
    const client = await connect()
    expect(text(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))).toContain('NO_BOOK')
  })

  it('needs the write scope, and listing needs the read scope', async () => {
    const reader = await connect({ ...CLAUDE, scopes: ['steuerdaten:read'] })
    expect(text(await reader.callTool({ name: 'buchung_entwerfen', arguments: draft() }))).toContain('steuerdaten:write')
    const writer = await connect({ ...CLAUDE, scopes: ['steuerdaten:write'] })
    expect(text(await writer.callTool({ name: 'buchungsentwuerfe_auflisten', arguments: { taxYear: YEAR } }))).toContain('steuerdaten:read')
  })

  it('lists its own open drafts readably, not another assistant’s, and not one the user took', async () => {
    const client = await connect()
    const first = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))
    const second = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft({ documentNumber: 'Q-18', text: 'Porto' }) }))
    const other = await connect({ ...CLAUDE, clientId: 'client-other' })
    await other.callTool({ name: 'buchung_entwerfen', arguments: draft({ documentNumber: 'X-1' }) })
    await confirmation.decideProposal(USER, YEAR, `buchung:${second.entwurf}.entry`, 'annehmen')

    const listed = parsed(await client.callTool({ name: 'buchungsentwuerfe_auflisten', arguments: { taxYear: YEAR } }))
    expect(listed.entwuerfe).toEqual([
      { entwurf: first.entwurf, datum: '2025-05-02', belegnummer: 'Q-17', text: 'Büromaterial', summeCent: 11900, zeilen: [{ konto: '4930', seite: 'debit', betragCent: 11900, steuerschluessel: 'vst19' }, { konto: '1200', seite: 'credit', betragCent: 11900 }] },
    ])
  })

  it('takes an own open draft back with eintrag_zuruecknehmen, and refuses one already posted', async () => {
    const client = await connect()
    const open = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))
    const back = parsed(await client.callTool({ name: 'eintrag_zuruecknehmen', arguments: { taxYear: YEAR, screen: 'buchung', instance: open.entwurf, field: 'entry' } }))
    expect(back).toMatchObject({ ok: true, ergebnis: 'vorschlag-entfernt' })
    expect(await confirmation.list(USER, YEAR)).toEqual([])

    const taken = parsed(await client.callTool({ name: 'buchung_entwerfen', arguments: draft() }))
    await confirmation.decideProposal(USER, YEAR, `buchung:${taken.entwurf}.entry`, 'annehmen')
    const refused = await client.callTool({ name: 'eintrag_zuruecknehmen', arguments: { taxYear: YEAR, screen: 'buchung', instance: taken.entwurf, field: 'entry' } })
    expect(text(refused)).toContain('NOT_OWN_ENTRY')
    expect(posted).toHaveLength(1)
  })

  it('maske_eintragen and maske_felder on the booking mask point to buchung_entwerfen', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'buchung', instance: 'x', field: 'entry', value: '{}' } })
    expect(text(res)).toContain('USE_BOOKING_TOOL')
    expect(text(res)).toContain('buchung_entwerfen')
    expect(text(await client.callTool({ name: 'maske_felder', arguments: { screen: 'buchung' } }))).toContain('buchung_entwerfen')
  })

  it('writes an audit entry for drafting and listing', async () => {
    const client = await connect()
    await client.callTool({ name: 'buchung_entwerfen', arguments: draft() })
    await client.callTool({ name: 'buchungsentwuerfe_auflisten', arguments: { taxYear: YEAR } })
    const resources = audit.all().map((e) => e.resource)
    expect(resources).toEqual(expect.arrayContaining(['buchung_entwerfen', 'buchungsentwuerfe_auflisten']))
  })
})
