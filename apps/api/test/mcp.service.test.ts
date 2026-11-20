import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpService, type AssistantSessionInfo } from '../src/mcp/mcp.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'
import { ReceiptService } from '../src/receipt/receipt.service.js'
import { UnlockService } from '../src/unlock/unlock.service.js'
import { AuditService } from '../src/audit/audit.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { FakeOwlSettingRepository, FakeOwlCardDismissalRepository } from './fakes/fake-owl-mode.repository.js'
import type { AssessmentRepository } from '../src/assessment/assessment.repository.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import { AssistantTaskService } from '../src/assistant-task/assistant-task.service.js'
import { FakeAssistantTaskRepository } from './fakes/fake-assistant-task.repository.js'
import type { UnlockRepository } from '../src/unlock/unlock.repository.js'
import type { PaymentProvider } from '../src/unlock/payment-provider.js'
import type { CommuteRepository } from '../src/commute/commute.repository.js'

const USER = 'user-mcp-1'
const YEAR = 2025

class FakeUnlockRepository implements UnlockRepository {
  private paid = new Set<string>()
  async isPaid(userId: string, taxYear: number): Promise<boolean> {
    return this.paid.has(`${userId}:${taxYear}`)
  }
  async createOpenOnes(): Promise<void> {}
  async markPaid(): Promise<void> {}
}

class FakePaymentProvider implements PaymentProvider {
  async createCheckout(): Promise<{ id: string; url: string }> {
    return { id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }
  }
  verifyEvent() {
    return { kind: 'bezahlt' as const, sessionId: 'cs_test_123', amountCents: 3900 }
  }
}

class FakeCommuteRepository implements CommuteRepository {
  async findForUserAndYear() {
    return null
  }
  async save(_u: string, _y: number, inputs: any) {
    return inputs
  }
}

describe('McpService (ADR-0052 §3 / §5 / §8 / §12)', () => {
  let profileRepo: FakeProfileRepository
  let masterDataRepo: FakeMasterDataRepository
  let lstbRepo: FakeLstbRepository
  let pensionRepo: FakePensionRepository
  let capitalRepo: FakeCapitalRepository
  let rentalRepo: FakeRentalRepository
  let markingsRepo: FakeMarkingRepository
  let receiptRepo: FakeReceiptRepository
  let interviewRepo: FakeInterviewAnswerRepository
  let chSalaryRepo: FakeChSalaryCertificateRepository
  let childRepo: FakeChildRepository
  let linkRepo: FakeLinkRepository
  let taxYearRepo: FakeTaxYearRepository
  let auditService: AuditService
  let confirmationService: ConfirmationService
  let cockpitService: CockpitService
  let printoutService: PrintoutService
  let owlModeService: OwlModeService
  let receiptService: ReceiptService
  let unlockService: UnlockService
  let mcpService: McpService

  const ALL_SCOPES_ASSISTANT: AssistantSessionInfo = {
    clientId: 'client-claude',
    clientName: 'Claude',
    scopes: ['steuerdaten:read', 'steuerdaten:write', 'belege:write', 'zahllink:read'],
  }

  beforeEach(async () => {
    profileRepo = new FakeProfileRepository()
    masterDataRepo = new FakeMasterDataRepository()
    lstbRepo = new FakeLstbRepository()
    pensionRepo = new FakePensionRepository()
    capitalRepo = new FakeCapitalRepository()
    rentalRepo = new FakeRentalRepository()
    markingsRepo = new FakeMarkingRepository()
    receiptRepo = new FakeReceiptRepository()
    interviewRepo = new FakeInterviewAnswerRepository()
    chSalaryRepo = new FakeChSalaryCertificateRepository()
    childRepo = new FakeChildRepository()
    linkRepo = new FakeLinkRepository()
    taxYearRepo = new FakeTaxYearRepository()
    taxYearRepo.seed(USER, { taxYear: YEAR, openItems: 0 })

    const auditRepo = new FakeAuditRepository()
    auditService = new AuditService(auditRepo)

    const fieldAccess = fieldAccessFrom({
      lstb: lstbRepo,
      pension: pensionRepo,
      capital: capitalRepo,
      rental: rentalRepo,
      profile: profileRepo,
      masterData: masterDataRepo,
      link: linkRepo,
      interview: interviewRepo,
      chSalaryCertificate: chSalaryRepo,
      child: childRepo,
    })
    confirmationService = new ConfirmationService(markingsRepo, fieldAccess, auditService)

    cockpitService = new CockpitService(
      taxYearRepo,
      lstbRepo,
      interviewRepo,
      markingsRepo,
      pensionRepo,
      capitalRepo,
      rentalRepo,
      chSalaryRepo,
    )

    unlockService = new UnlockService(new FakeUnlockRepository(), new FakePaymentProvider(), 'http://localhost:8081')

    printoutService = new PrintoutService(
      profileRepo,
      masterDataRepo,
      lstbRepo,
      pensionRepo,
      capitalRepo,
      rentalRepo,
      chSalaryRepo,
      childRepo,
      linkRepo,
      interviewRepo,
      markingsRepo,
      new FakeCommuteRepository(),
      unlockService,
      auditService,
      new URL('../../assets/vordrucke/', import.meta.url),
    )

    owlModeService = new OwlModeService(
      new FakeOwlSettingRepository(),
      new FakeOwlCardDismissalRepository(),
      childRepo,
      interviewRepo,
      { findForUserAndYear: async () => null } as unknown as AssessmentRepository,
      new RagKiAdapter(),
      auditService,
    )

    receiptService = new ReceiptService(receiptRepo, auditService, new InMemoryStorageAdapter())

    mcpService = new McpService(
      cockpitService,
      printoutService,
      confirmationService,
      owlModeService,
      receiptService,
      unlockService,
      profileRepo,
      masterDataRepo,
      auditService,
    )
  })

  async function connectClient(assistant: AssistantSessionInfo = ALL_SCOPES_ASSISTANT) {
    const server = mcpService.createServer(USER, assistant)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)

    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    return client
  }

  function getText(res: unknown): string {
    const content = (res as { content: Array<{ type: string; text: string }> }).content
    return content[0]?.text ?? ''
  }

  it('lists the booking-free domain tools and the deterministic advice tools', async () => {
    const client = await connectClient()
    const result = await client.listTools()
    const toolNames = result.tools.map((t) => t.name).sort()

    expect(toolNames).toEqual([
      'ausdruck_vorpruefung',
      'beleg_hochladen',
      'belege_auflisten',
      'einkommensteuer_berechnen',
      'eintrag_zuruecknehmen',
      'eulen_hinweise',
      'feld_finden',
      'gesetzestext_lesen',
      'gewerbesteuer_schaetzen',
      'haushalt_ueberblick',
      'kapitalertraege_guenstigerpruefung',
      'kleinunternehmer_pruefen',
      'maske_eintragen',
      'maske_eintragen_stapel',
      'maske_felder',
      'maske_lesen',
      'rechtsquelle_nachschlagen',
      'renovierung_15_prozent_pruefen',
      'schenkungsteuer_berechnen',
      'spekulationsfrist_pruefen',
      'steuerwissen_lesen',
      'veranlagungsarten_vergleichen',
      'vordruck_zeilen',
      'wechselkurs',
      'zahllink_anfordern',
    ])
  })

  it('einkommensteuer_berechnen quotes the tax core instead of letting the assistant work it out', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'einkommensteuer_berechnen', arguments: { year: 2025, taxableIncome: 50000 } })
    const parsed = JSON.parse(getText(res))
    expect(parsed.ok).toBe(true)
    expect(parsed.incomeTaxEur).toBeGreaterThan(0)
    expect(parsed.totalEur).toBeGreaterThanOrEqual(parsed.incomeTaxEur)
  })

  it('the advice tools need the read scope and refuse an assistant without it', async () => {
    const client = await connectClient({ ...ALL_SCOPES_ASSISTANT, scopes: ['belege:write'] })
    const res = await client.callTool({ name: 'steuerwissen_lesen', arguments: { topic: 'kennzahlen' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('steuerdaten:read')
  })

  it('steuerwissen_lesen returns the checked knowledge section', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'steuerwissen_lesen', arguments: { topic: 'kennzahlen' } })
    const parsed = JSON.parse(getText(res))
    expect(parsed.ok).toBe(true)
    expect(parsed.text.length).toBeGreaterThan(100)
  })

  it('maske_eintragen refuses an unknown field with the valid ones, as the in-app advisor does', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'grossWageEur', value: '5000' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('UNKNOWN_FIELD')
  })

  it('maske_eintragen refuses a value the field cannot hold', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: 'viel Geld' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('INVALID_VALUE')
  })

  it('steuerbericht, offene_fragen and auswirkung_simulieren give the assistant feedback for its user', async () => {
    const report = {
      report: async (_u: string, taxYear: number) => ({ taxYear, nextSteps: ['x'] }),
      openQuestions: async () => ({ openQuestions: 2, next: { id: 'job', kind: 'question', answers: ['Angestellt'] } }),
      simulateEntries: async () => ({ ok: true, beforeRefundEur: 100, afterRefundEur: 250, deltaEur: 150 }),
    }
    const withReport = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, report as never)
    const server = withReport.createServer(USER, ALL_SCOPES_ASSISTANT)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)

    expect(JSON.parse(getText(await client.callTool({ name: 'steuerbericht', arguments: { taxYear: YEAR } }))).taxYear).toBe(YEAR)
    expect(JSON.parse(getText(await client.callTool({ name: 'offene_fragen', arguments: { taxYear: YEAR } }))).next.id).toBe('job')
    const sim = await client.callTool({ name: 'auswirkung_simulieren', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '50000' } })
    expect(JSON.parse(getText(sim)).deltaEur).toBe(150)
  })

  it('auswirkung_simulieren writes on trial, so it needs the write scope and refuses a read-only assistant', async () => {
    const report = { simulateEntries: vi.fn() }
    const withReport = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, report as never)
    const server = withReport.createServer(USER, { ...ALL_SCOPES_ASSISTANT, scopes: ['steuerdaten:read'] })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    const res = await client.callTool({ name: 'auswirkung_simulieren', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '50000' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('steuerdaten:write')
    expect(report.simulateEntries).not.toHaveBeenCalled()
  })

  it('szenario_simulieren hands every checked entry to one simulation, Person B’s in her data', async () => {
    const report = { simulateEntries: vi.fn().mockResolvedValue({ ok: true, beforeRefundEur: 0, afterRefundEur: 10, deltaEur: 10 }) }
    const link = { spouseForAdvisor: async () => ({ spouseUserId: 'shadow-b', recordable: true, firstName: null, lastName: null }), dataUser: async () => 'shadow-b' }
    const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, report as never, link as never)
    const server = svc.createServer(USER, ALL_SCOPES_ASSISTANT)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    const eintraege = [{ screen: 'chLohnausweis', field: 'krankenkasseChf', value: '3.593', person: 'A' }, { screen: 'chLohnausweis', field: 'krankenkasseChf', value: '3593', person: 'B' }]
    expect(JSON.parse(getText(await client.callTool({ name: 'szenario_simulieren', arguments: { taxYear: YEAR, eintraege } }))).deltaEur).toBe(10)
    expect(report.simulateEntries).toHaveBeenCalledWith(USER, YEAR, [expect.objectContaining({ field: 'krankenkasseChf', value: '3593', dataUserId: USER }), expect.objectContaining({ dataUserId: 'shadow-b' })])
    const bad = await client.callTool({ name: 'szenario_simulieren', arguments: { taxYear: YEAR, eintraege: [{ screen: 'lstb', field: 'gibtEsNicht', value: '1', person: 'A' }] } })
    expect(JSON.parse(getText(bad)).ok).toBe(false)
  })

  it('auswirkung_simulieren refuses a target the advisor would refuse and stores nothing', async () => {
    const report = { simulateEntries: async () => { throw new Error('must not run') } }
    const withReport = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, report as never)
    const server = withReport.createServer(USER, ALL_SCOPES_ASSISTANT)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    const res = await client.callTool({ name: 'auswirkung_simulieren', arguments: { taxYear: YEAR, screen: 'lstb', field: 'gibtEsNicht', value: '1' } })
    expect(JSON.parse(getText(res)).ok).toBe(false)
  })

  describe('maske_eintragen for Person B (ADR-0054, ADR-0052 amendment 2)', () => {
    const SHADOW_B = 'shadow-b-mcp'
    async function clientWith(link: unknown) {
      const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, undefined, link as never)
      const server = svc.createServer(USER, ALL_SCOPES_ASSISTANT)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'TestClient', version: '1.0.0' })
      await client.connect(clientTransport)
      return client
    }
    const recordedB = {
      spouseForAdvisor: async () => ({ spouseUserId: SHADOW_B, recordable: true, firstName: null, lastName: null }),
      dataUser: async (_u: string, _y: number, person: 'A' | 'B') => (person === 'B' ? SHADOW_B : USER),
    }

    it('writes Person B’s value into her data, unconfirmed', async () => {
      const client = await clientWith(recordedB)
      const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '42000', person: 'B' } })
      expect(JSON.parse(getText(res)).ergebnis).toBe('geschrieben')
      expect((await lstbRepo.findForUserAndYear(SHADOW_B, YEAR))?.bruttoarbeitslohn).toBe('42000')
      expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn ?? null).toBeNull()
    })

    it('asks for the person on a mask that exists twice in a joint return', async () => {
      const client = await clientWith(recordedB)
      const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '42000' } })
      expect((res as { isError?: boolean }).isError).toBe(true)
      expect(getText(res)).toContain('PERSON_REQUIRED')
    })

    it('refuses Person B without a joint return, and on a joint mask', async () => {
      const none = await clientWith({ spouseForAdvisor: async () => null, dataUser: async () => USER })
      expect(getText(await none.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '1', person: 'B' } }))).toContain('NO_PERSON_B')
      const joint = await clientWith(recordedB)
      expect(getText(await joint.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'kapital', field: 'inhaber', value: 'gemeinsam', person: 'B' } }))).toContain('JOINT_SCREEN')
    })
  })

  describe('children (ADR-0052 amendment 2)', () => {
    async function clientWith(children: unknown, scopes = ALL_SCOPES_ASSISTANT.scopes) {
      const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, undefined, undefined, children as never)
      const server = svc.createServer(USER, { ...ALL_SCOPES_ASSISTANT, scopes })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'TestClient', version: '1.0.0' })
      await client.connect(clientTransport)
      return client
    }
    const zeynep = { id: 'kind-1', sequenceNumber: 1, firstName: 'Zeynep', lastName: 'Sevinc', geburtsdatum: '2022-06-14' }

    it('kinder_auflisten names each child by id, number, masked name and birth year only', async () => {
      const client = await clientWith({ list: async () => ({ kinder: [zeynep] }) })
      const parsed = JSON.parse(getText(await client.callTool({ name: 'kinder_auflisten', arguments: { taxYear: YEAR } })))
      expect(parsed.kinder).toEqual([{ instance: 'kind-1', nummer: 1, alterJahre: YEAR - 2022 }])
      expect(getText(await client.callTool({ name: 'kinder_auflisten', arguments: { taxYear: YEAR } }))).not.toContain('Zeynep')
    })

    it('kind_anlegen creates the child and returns the instance for maske_eintragen', async () => {
      const kinder: (typeof zeynep)[] = []
      const children = { list: async () => ({ kinder }), create: vi.fn(async () => { kinder.push(zeynep); return { kinder } }) }
      const client = await clientWith(children)
      const res = await client.callTool({ name: 'kind_anlegen', arguments: { taxYear: YEAR, firstName: 'Zeynep', lastName: 'Sevinc', geburtsdatum: '2022-06-14' } })
      expect(JSON.parse(getText(res))).toMatchObject({ ok: true, instance: 'kind-1' })
      expect(children.create).toHaveBeenCalledWith(USER, YEAR, { firstName: 'Zeynep', lastName: 'Sevinc', geburtsdatum: '2022-06-14' })
    })

    it('kind_anlegen does not create the same child twice, it returns the one already there', async () => {
    const kinder = [zeynep]
    const children = { list: async () => ({ kinder }), create: vi.fn() }
    const client = await clientWith(children)
    const res = await client.callTool({ name: 'kind_anlegen', arguments: { taxYear: YEAR, firstName: ' zeynep ', lastName: 'Sevinc', geburtsdatum: '2022-06-14' } })
    expect(JSON.parse(getText(res))).toMatchObject({ ok: true, instance: 'kind-1', bereitsVorhanden: true })
    expect(children.create).not.toHaveBeenCalled()
  })

  it('kind_anlegen needs the write scope', async () => {
      const children = { list: async () => ({ kinder: [] }), create: vi.fn() }
      const client = await clientWith(children, ['steuerdaten:read'])
      const res = await client.callTool({ name: 'kind_anlegen', arguments: { taxYear: YEAR, firstName: 'Z', lastName: 'S', geburtsdatum: '2022-06-14' } })
      expect((res as { isError?: boolean }).isError).toBe(true)
      expect(children.create).not.toHaveBeenCalled()
    })
  })

  it('maske_felder describes each field of a mask, with the hints of the catalogue', async () => {
    const client = await connectClient()
    const parsed = JSON.parse(getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'lstb' } })))
    expect(parsed).toMatchObject({ screen: 'lstb', braucht_instance: false, je_person: true })
    expect(parsed.felder.find((f: { feld: string }) => f.feld === 'zuschuesseKvPv').beschreibung).toContain('Zeile 24 a–c zusammen')
    const kind = JSON.parse(getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'kind' } })))
    expect(kind.braucht_instance).toBe(true)
    expect(kind.felder.find((f: { feld: string }) => f.feld === 'swissFamilyAllowanceEur').beschreibung).toContain('NICHT im Bruttolohn')
  })

  it('maske_felder names no tool of the in-app advisor the assistant does not have', async () => {
    const client = await connectClient()
    const text = getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'chLohnausweis' } }))
    expect(text).not.toContain('propose_two_paths')
    const field = JSON.parse(text).felder.find((f: { feld: string }) => f.feld === 'steuerfreiesKrankentaggeldChf')
    expect(field.beschreibung).toContain('beide Wege')
  })

  it('maske_felder leaves out the fields an assistant never writes and the booking mask', async () => {
    const client = await connectClient()
    const kopplung = JSON.parse(getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'kopplung' } })))
    expect(kopplung.felder.map((f: { feld: string }) => f.feld)).toEqual(['filingType'])
    const buchung = await client.callTool({ name: 'maske_felder', arguments: { screen: 'buchung' } })
    expect(JSON.parse(getText(buchung)).ok).toBe(false)
  })

  describe('taking back what the assistant entered (ADR-0052 amendment 2)', () => {
    async function clientWithChildren() {
      const children = {
        list: async (u: string, y: number) => ({ kinder: await childRepo.listForUserAndYear(u, y) }),
        create: async (u: string, y: number, dto: { firstName: string; lastName: string; geburtsdatum: string }) => {
          await childRepo.create(u, y, dto)
          return { kinder: await childRepo.listForUserAndYear(u, y) }
        },
        delete: async (u: string, y: number, id: string) => {
          await childRepo.delete(u, y, id)
          return { kinder: await childRepo.listForUserAndYear(u, y) }
        },
      }
      const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, undefined, undefined, children as never)
      const server = svc.createServer(USER, ALL_SCOPES_ASSISTANT)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'TestClient', version: '1.0.0' })
      await client.connect(clientTransport)
      return client
    }

    it('eintrag_zuruecknehmen clears its own unconfirmed value and refuses one the user entered', async () => {
      const client = await connectClient()
      await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'lohnsteuer', value: '700' } })
      const res = await client.callTool({ name: 'eintrag_zuruecknehmen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'lohnsteuer' } })
      expect(JSON.parse(getText(res))).toMatchObject({ ok: true, ergebnis: 'zurueckgenommen' })
      expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.lohnsteuer ?? null).toBeNull()
      await lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '60000')
      const refused = await client.callTool({ name: 'eintrag_zuruecknehmen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn' } })
      expect((refused as { isError?: boolean }).isError).toBe(true)
      expect(getText(refused)).toContain('NOT_OWN_ENTRY')
    })

    it('kind_anlegen marks the child as the assistant’s entry, and kind_entfernen removes such a child', async () => {
      const client = await clientWithChildren()
      const created = JSON.parse(getText(await client.callTool({ name: 'kind_anlegen', arguments: { taxYear: YEAR, firstName: 'Zeynep', lastName: 'Sevinc', geburtsdatum: '2022-06-14' } })))
      expect((await confirmationService.list(USER, YEAR)).filter((m) => m.key.startsWith(`kind:${created.instance}.`)).every((m) => !m.confirmed && m.provenance.kind === 'assistent')).toBe(true)
      await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'kind', instance: created.instance, field: 'childcareEur', value: '616' } })
      const res = await client.callTool({ name: 'kind_entfernen', arguments: { taxYear: YEAR, instance: created.instance } })
      expect(JSON.parse(getText(res))).toMatchObject({ ok: true })
      expect(await childRepo.listForUserAndYear(USER, YEAR)).toEqual([])
      expect((await confirmationService.list(USER, YEAR)).filter((m) => m.key.startsWith('kind:'))).toEqual([])
    })

    it('kind_entfernen refuses a child the user created, or one the user already confirmed', async () => {
      const client = await clientWithChildren()
      await childRepo.create(USER, YEAR, { firstName: 'Ali', lastName: 'Sevinc', geburtsdatum: '2020-01-01' })
      const own = (await childRepo.listForUserAndYear(USER, YEAR))[0]!
      const refused = await client.callTool({ name: 'kind_entfernen', arguments: { taxYear: YEAR, instance: own.id } })
      expect((refused as { isError?: boolean }).isError).toBe(true)
      const created = JSON.parse(getText(await client.callTool({ name: 'kind_anlegen', arguments: { taxYear: YEAR, firstName: 'Zeynep', lastName: 'Sevinc', geburtsdatum: '2022-06-14' } })))
      await confirmationService.confirmAnnex(USER, YEAR, 'anlageKind')
      const confirmed = await client.callTool({ name: 'kind_entfernen', arguments: { taxYear: YEAR, instance: created.instance } })
      expect((confirmed as { isError?: boolean }).isError).toBe(true)
      expect(await childRepo.listForUserAndYear(USER, YEAR)).toHaveLength(2)
    })
  })

  describe('rental objects as records (#549)', () => {
    async function clientWithRentals() {
      const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, undefined, undefined, undefined, undefined, rentalRepo)
      const server = svc.createServer(USER, ALL_SCOPES_ASSISTANT)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'TestClient', version: '1.0.0' })
      await client.connect(clientTransport)
      return client
    }

    it('vermietung_anlegen creates an object the assistant can fill, list and remove again', async () => {
      const client = await clientWithRentals()
      const created = JSON.parse(getText(await client.callTool({ name: 'vermietung_anlegen', arguments: { taxYear: YEAR } })))
      expect(created).toMatchObject({ ok: true, nummer: 1 })
      await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'vermietung', instance: created.instance, field: 'mieteinnahmen', value: '9600' } })
      expect((await rentalRepo.listForUserAndYear(USER, YEAR))[0]?.mieteinnahmen).toBe('9600')
      const listed = JSON.parse(getText(await client.callTool({ name: 'vermietungen_auflisten', arguments: { taxYear: YEAR } })))
      expect(listed.objekte).toEqual([{ instance: created.instance, nummer: 1 }])
      const removed = await client.callTool({ name: 'vermietung_entfernen', arguments: { taxYear: YEAR, instance: created.instance } })
      expect(JSON.parse(getText(removed))).toMatchObject({ ok: true })
      expect(await rentalRepo.listForUserAndYear(USER, YEAR)).toEqual([])
      expect((await confirmationService.list(USER, YEAR)).filter((m) => m.key.startsWith('vermietung:'))).toEqual([])
    })

    it('vermietung_entfernen keeps an object of the user and one that is not there', async () => {
      const client = await clientWithRentals()
      const own = await rentalRepo.create(USER, YEAR)
      const refused = await client.callTool({ name: 'vermietung_entfernen', arguments: { taxYear: YEAR, instance: own.id } })
      expect(getText(refused)).toContain('NOT_OWN_ENTRY')
      expect(getText(await client.callTool({ name: 'vermietung_entfernen', arguments: { taxYear: YEAR, instance: 'nope' } }))).toContain('NO_RECORD')
      expect(await rentalRepo.listForUserAndYear(USER, YEAR)).toHaveLength(1)
    })

    it('vermietung_anlegen needs the write scope and stops at ten objects', async () => {
      const client = await clientWithRentals()
      for (let i = 0; i < 10; i += 1) await rentalRepo.create(USER, YEAR)
      expect(getText(await client.callTool({ name: 'vermietung_anlegen', arguments: { taxYear: YEAR } }))).toContain('TOO_MANY')
    })
  })

  describe('tasks for the user (#547)', () => {
    let tasks: AssistantTaskService

    async function clientWithTasks(assistant: AssistantSessionInfo = ALL_SCOPES_ASSISTANT) {
      const svc = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, undefined, undefined, undefined, undefined, undefined, tasks)
      const server = svc.createServer(USER, assistant)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'TestClient', version: '1.0.0' })
      await client.connect(clientTransport)
      return client
    }

    beforeEach(() => {
      tasks = new AssistantTaskService(new FakeAssistantTaskRepository())
    })

    it('aufgabe_fuer_nutzer leaves a task the user sees, and aufgaben_auflisten shows its state', async () => {
      const client = await clientWithTasks()
      const created = JSON.parse(getText(await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: { taxYear: YEAR, art: 'konfession', text: 'Bitte trage deine Konfession in den Stammdaten ein.' } })))
      expect(created).toMatchObject({ ok: true, status: 'offen' })
      expect(await tasks.listOpen(USER, YEAR)).toMatchObject([{ id: created.id, kind: 'konfession', assistant: 'Claude' }])

      await tasks.decide(USER, YEAR, created.id, 'erledigt')
      const listed = JSON.parse(getText(await client.callTool({ name: 'aufgaben_auflisten', arguments: { taxYear: YEAR } })))
      expect(listed.aufgaben).toEqual([{ id: created.id, art: 'konfession', text: 'Bitte trage deine Konfession in den Stammdaten ein.', status: 'erledigt' }])
    })

    it('the same open task twice is one task', async () => {
      const client = await clientWithTasks()
      const args = { taxYear: YEAR, art: 'bestaetigen', text: 'Bitte bestätige die Einträge der Anlage N.' }
      const first = JSON.parse(getText(await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: args })))
      const second = JSON.parse(getText(await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: args })))
      expect(second.id).toBe(first.id)
      expect(await tasks.listOpen(USER, YEAR)).toHaveLength(1)
    })

    it('refuses a text with an identifier, an empty one, and the twenty-first open task', async () => {
      const client = await clientWithTasks()
      const withIban = await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: { taxYear: YEAR, art: 'sonstiges', text: 'Prüfe die IBAN DE89370400440532013000.' } })
      expect((withIban as { isError?: boolean }).isError).toBe(true)
      expect(getText(withIban)).toContain('TEXT_HAS_IDENTIFIER')
      expect(getText(await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: { taxYear: YEAR, art: 'sonstiges', text: '  ' } }))).toContain('TEXT_INVALID')
      expect(await tasks.listOpen(USER, YEAR)).toEqual([])
      for (let i = 0; i < 20; i += 1) await tasks.create(USER, YEAR, { kind: 'sonstiges', text: `Aufgabe ${i}`, assistant: 'Claude' })
      expect(getText(await client.callTool({ name: 'aufgabe_fuer_nutzer', arguments: { taxYear: YEAR, art: 'sonstiges', text: 'Eine mehr' } }))).toContain('TOO_MANY_TASKS')
    })

    it('an assistant lists only the tasks it left itself', async () => {
      await tasks.create(USER, YEAR, { kind: 'sonstiges', text: 'Von einem anderen Assistenten', assistant: 'Another' })
      await tasks.create('user-2', YEAR, { kind: 'sonstiges', text: 'Eines anderen Nutzers', assistant: 'Claude' })
      const client = await clientWithTasks()
      expect(JSON.parse(getText(await client.callTool({ name: 'aufgaben_auflisten', arguments: { taxYear: YEAR } }))).aufgaben).toEqual([])
    })

    it('leaving a task needs the write scope, listing the read scope', async () => {
      const readOnly = await clientWithTasks({ ...ALL_SCOPES_ASSISTANT, scopes: ['steuerdaten:read'] })
      expect(getText(await readOnly.callTool({ name: 'aufgabe_fuer_nutzer', arguments: { taxYear: YEAR, art: 'sonstiges', text: 'Bitte prüfen.' } }))).toContain('steuerdaten:write')
      expect(await tasks.listOpen(USER, YEAR)).toEqual([])
      const writeOnly = await clientWithTasks({ ...ALL_SCOPES_ASSISTANT, scopes: ['steuerdaten:write'] })
      expect(getText(await writeOnly.callTool({ name: 'aufgaben_auflisten', arguments: { taxYear: YEAR } }))).toContain('steuerdaten:read')
    })

    it('without the task seam the tools are not offered', async () => {
      const client = await connectClient()
      expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('aufgabe_fuer_nutzer')
    })
  })

  describe('maske_eintragen_stapel (ADR-0052 amendment 3, #544)', () => {
    it('writes first and last name of an empty profile, and counts a proposal apart from a written value', async () => {
      const client = await connectClient()
      const names = JSON.parse(getText(await client.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'profil', felder: { firstName: 'Suhay', lastName: 'Sevinc' } } })))
      expect(names.felder.lastName).toMatchObject({ ergebnis: 'geschrieben' })
      expect(await profileRepo.findByUserId(USER)).toMatchObject({ firstName: 'Suhay', lastName: 'Sevinc' })
      await lstbRepo.setField(USER, YEAR, 'lohnsteuer', '700')
      const mixed = JSON.parse(getText(await client.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'lstb', felder: { lohnsteuer: '720', bruttoarbeitslohn: '65000' } } })))
      expect(mixed).toMatchObject({ geschrieben: 1, vorschlaege: 1, abgelehnt: 0 })
    })

    it('writes many fields of one mask in one call and answers per field', async () => {
      const client = await connectClient()
      const res = await client.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'lstb', felder: { bruttoarbeitslohn: '65.000', lohnsteuer: '12000', gibtEsNicht: '1', kirchensteuer: 'viel' } } })
      const parsed = JSON.parse(getText(res))
      expect(parsed.geschrieben).toBe(2)
      expect(parsed.abgelehnt).toBe(2)
      expect(parsed.felder.bruttoarbeitslohn).toMatchObject({ ergebnis: 'geschrieben' })
      expect(parsed.felder.gibtEsNicht.fehler).toContain('UNKNOWN_FIELD')
      expect(parsed.felder.kirchensteuer.fehler).toContain('INVALID_VALUE')
      expect(await lstbRepo.findForUserAndYear(USER, YEAR)).toMatchObject({ bruttoarbeitslohn: '65000', lohnsteuer: '12000' })
    })

    it('keeps the user’s value and files a proposal, like the single entry', async () => {
      await lstbRepo.setField(USER, YEAR, 'lohnsteuer', '700')
      const client = await connectClient()
      const parsed = JSON.parse(getText(await client.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'lstb', felder: { lohnsteuer: '720' } } })))
      expect(parsed.felder.lohnsteuer.ergebnis).toBe('vorschlag')
      expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.lohnsteuer).toBe('700')
    })

    it('refuses more than 60 fields and needs the write scope', async () => {
      const client = await connectClient()
      const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`f${i}`, '1']))
      expect((await client.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'lstb', felder: many } }) as { isError?: boolean }).isError).toBe(true)
      const readOnly = await connectClient({ ...ALL_SCOPES_ASSISTANT, scopes: ['steuerdaten:read'] })
      expect((await readOnly.callTool({ name: 'maske_eintragen_stapel', arguments: { taxYear: YEAR, screen: 'lstb', felder: { lohnsteuer: '1' } } }) as { isError?: boolean }).isError).toBe(true)
    })
  })

  it('refuses a confession over MCP and points to the yes/no instead (Art. 9, #543)', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'stammdaten', field: 'religion', value: 'RK' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('kirchensteuerpflichtig')
    expect((await masterDataRepo.findByUserId(USER))?.religion ?? null).toBeNull()
    const felder = JSON.parse(getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'stammdaten' } }))).felder.map((f: { feld: string }) => f.feld)
    expect(felder).toContain('kirchensteuerpflichtig')
    expect(felder).not.toContain('religion')
    const ok = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'stammdaten', field: 'kirchensteuerpflichtig', value: 'false' } })
    expect(JSON.parse(getText(ok)).ergebnis).toBe('geschrieben')
    const household = JSON.parse(getText(await client.callTool({ name: 'haushalt_ueberblick', arguments: { taxYear: YEAR } })))
    expect(household.personen[0].kirchensteuerpflichtig).toBe(false)
  })

  describe('comfort tools (#548)', () => {
    it('wechselkurs names the annual average rate of the year', async () => {
      const client = await connectClient()
      expect(JSON.parse(getText(await client.callTool({ name: 'wechselkurs', arguments: { taxYear: 2025 } })))).toMatchObject({ ok: true, eurJeChf: 1.065 })
      expect(JSON.parse(getText(await client.callTool({ name: 'wechselkurs', arguments: { taxYear: 1999 } }))).ok).toBe(false)
    })

    it('feld_finden finds a field by a word of its description, never the confession', async () => {
      const client = await connectClient()
      const hits = JSON.parse(getText(await client.callTool({ name: 'feld_finden', arguments: { stichwort: 'Krankentaggeld' } }))).treffer
      expect(hits.map((h: { feld: string }) => h.feld)).toContain('steuerfreiesKrankentaggeldChf')
      const religion = JSON.parse(getText(await client.callTool({ name: 'feld_finden', arguments: { stichwort: 'religion' } }))).treffer
      expect(religion.map((h: { feld: string }) => `${h.feld}`)).not.toContain('religion')
    })

    it('vordruck_zeilen shows Kennzahlen with amounts only, no name, id or address', async () => {
      await profileRepo.upsert(USER, { firstName: 'Markus', lastName: 'Brenner', steuerId: '12345678901', steuernummer: '0812345678' })
      await lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '65000')
      const client = await connectClient()
      const text = getText(await client.callTool({ name: 'vordruck_zeilen', arguments: { taxYear: YEAR } }))
      const anlN = JSON.parse(text).formulare.find((f: { formular: string }) => f.formular === 'anlage-n')
      expect(Object.values(anlN.kennzahlen)).toContain('65000')
      for (const secret of ['Markus', 'Brenner', '12345678901', '0812345678']) expect(text, secret).not.toContain(secret)
      expect(Object.keys(JSON.parse(text).formulare.flatMap((f: { kennzahlen: object }) => Object.keys(f.kennzahlen))).length).toBeGreaterThan(0)
    })
  })

  it('maske_eintragen points a booking to the booking path instead of writing it as a field', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'buchung', field: 'betrag', value: '10' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('USE_BOOKING_TOOL')
  })

  it('haushalt_ueberblick shows the household derived, without any name, id, address or birth date', async () => {
    await profileRepo.upsert(USER, {
      firstName: 'Markus',
      lastName: 'Brenner',
      steuerId: '12345678901',
      steuernummer: '0812345678',
    })
    await masterDataRepo.save(USER, {
      geburtsdatum: '1985-05-15',
      strasse: 'Grenzacherstrasse',
      hausnummer: '100',
      hausnummerZusatz: null,
      plz: '4058',
      wohnort: 'Basel',
      beruf: 'Entwickler',
      religion: null,
      familienstand: 'verheiratet',
      familienstandSeit: '2015-06-01',
      iban: 'DE89370400440532013000',
      kontoinhaber: 'Markus Brenner',
      finanzamt: 'Lörrach',
      telefon: '07621 123456',
      religionEinwilligungAm: null,
    })

    const client = await connectClient()
    const text = getText(await client.callTool({ name: 'haushalt_ueberblick', arguments: { taxYear: YEAR } }))
    const parsed = JSON.parse(text)

    // Derived, never the detail (ADR-0052 amendment 3).
    expect(parsed.personen[0]).toMatchObject({ person: 'A', alterJahre: YEAR - 1985, familienstand: 'verheiratet', kirchensteuerpflichtig: null })
    for (const secret of ['Markus', 'Brenner', '12345678901', '0812345678', 'Grenzacherstrasse', 'DE89370400440532013000', '07621', '4058', 'Basel', 'Entwickler', '1985-05-15']) {
      expect(text, secret).not.toContain(secret)
    }
  })

  it('maske_lesen reads amounts in plain with state and source, and people only derived', async () => {
    await masterDataRepo.save(USER, { geburtsdatum: '1985-05-15', strasse: 'Musterweg', hausnummer: '1', hausnummerZusatz: null, plz: '78176', wohnort: 'Blumberg', beruf: 'Entwickler', religion: 'RK', familienstand: 'verheiratet', familienstandSeit: null, iban: null, kontoinhaber: null, finanzamt: null, telefon: null, religionEinwilligungAm: null })
    await lstbRepo.setField(USER, YEAR, 'lohnsteuer', '700')
    const client = await connectClient()
    await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '65000' } })
    await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'lohnsteuer', value: '720' } })

    const lstb = JSON.parse(getText(await client.callTool({ name: 'maske_lesen', arguments: { taxYear: YEAR, screen: 'lstb', nurGefuellte: true } })))
    expect(lstb.felder).toEqual([
      { feld: 'bruttoarbeitslohn', wert: '65000', stand: 'unbestaetigt', herkunft: 'du' },
      { feld: 'lohnsteuer', wert: '700', stand: 'vorschlag-offen', herkunft: 'nutzer', vorschlag: { wert: '720', herkunft: 'du' } },
    ])

    const text = getText(await client.callTool({ name: 'maske_lesen', arguments: { taxYear: YEAR, screen: 'stammdaten' } }))
    const stamm = Object.fromEntries(JSON.parse(text).felder.map((f: { feld: string }) => [f.feld, f]))
    expect(stamm.geburtsdatum).toMatchObject({ gesetzt: true, alterJahre: YEAR - 1985 })
    expect(stamm.plz).toMatchObject({ gesetzt: true, bundesland: 'BW' })
    expect(stamm.religion).toMatchObject({ gesetzt: true, kirchensteuerpflichtig: true })
    expect(stamm.strasse).toMatchObject({ gesetzt: true })
    for (const secret of ['Musterweg', '78176', 'Blumberg', 'Entwickler', '1985-05-15', '"RK"']) expect(text, secret).not.toContain(secret)
  })

  it('maske_lesen needs the instance for a child and names the kind of another assistant’s entry, not its name', async () => {
    const client = await connectClient()
    expect(getText(await client.callTool({ name: 'maske_lesen', arguments: { taxYear: YEAR, screen: 'kind' } }))).toContain('RECORD_REQUIRED')
    const other = await connectClient({ ...ALL_SCOPES_ASSISTANT, clientName: 'Gemini' })
    await other.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'lohnsteuer', value: '700' } })
    const text = getText(await client.callTool({ name: 'maske_lesen', arguments: { taxYear: YEAR, screen: 'lstb', nurGefuellte: true } }))
    expect(JSON.parse(text).felder[0]).toMatchObject({ herkunft: 'anderer-assistent' })
    expect(text).not.toContain('Gemini')
  })

  it('belege_auflisten lists receipts without their file names', async () => {
    const client = await connectClient()
    const created = JSON.parse(getText(await client.callTool({ name: 'beleg_hochladen', arguments: { fileName: 'Sevinc_Lohnausweis.pdf', taxYear: YEAR } })))
    await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: 'lohnsteuer', value: '700', receiptId: created.belegId } })
    const text = getText(await client.callTool({ name: 'belege_auflisten', arguments: { taxYear: YEAR } }))
    expect(JSON.parse(text).belege).toEqual([expect.objectContaining({ belegId: created.belegId, steuerjahr: YEAR, felder: ['lstb.lohnsteuer'] })])
    expect(text).not.toContain('Sevinc')
  })

  it('maske_eintragen writes values as unconfirmed with assistant provenance', async () => {
    const client = await connectClient()
    const res = await client.callTool({
      name: 'maske_eintragen',
      arguments: {
        taxYear: YEAR,
        screen: 'lstb',
        field: 'bruttoarbeitslohn',
        value: '65000',
      },
    })
    const text = getText(res)
    const parsed = JSON.parse(text)

    expect(parsed.schluessel).toBe('lstb.bruttoarbeitslohn')
    expect(parsed.ergebnis).toBe('geschrieben')

    // Confirm that lstb has the value
    expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('65000')

    // Confirm marking exists and is unconfirmed
    const markings = await confirmationService.list(USER, YEAR)
    const marking = markings.find((m) => m.key === 'lstb.bruttoarbeitslohn')
    expect(marking?.confirmed).toBe(false)
    expect(marking?.provenance).toEqual({ kind: 'assistent', name: 'Claude' })
  })

  it('maske_eintragen stores the value as the catalogue tidied it, under the trimmed field name', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'lstb', field: ' bruttoarbeitslohn ', value: '50.000' } })
    expect(JSON.parse(getText(res)).schluessel).toBe('lstb.bruttoarbeitslohn')
    expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('50000')
  })

  it('maske_eintragen creates a proposal if user already entered a confirmed value', async () => {
    // User already entered 60000
    await lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '60000')

    const client = await connectClient()
    const res = await client.callTool({
      name: 'maske_eintragen',
      arguments: {
        taxYear: YEAR,
        screen: 'lstb',
        field: 'bruttoarbeitslohn',
        value: '65000',
      },
    })
    const parsed = JSON.parse(getText(res))

    expect(parsed.ergebnis).toBe('vorschlag')
    // Value remains 60000, proposal is 65000
    expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('60000')

    const overview = await confirmationService.overview(USER, YEAR)
    const prop = overview.annexes[0]?.values[0]?.proposal
    expect(prop?.value).toBe('65000')
    expect(prop?.provenance).toEqual({ kind: 'assistent', name: 'Claude' })
  })

  it('ausdruck_vorpruefung returns what is missing for printout', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'ausdruck_vorpruefung', arguments: { taxYear: YEAR } })
    const parsed = JSON.parse(getText(res))

    expect(parsed.steuerjahr).toBe(YEAR)
    expect(parsed.druckfaehig).toBe(false)
    expect(parsed.fehlend).toBeInstanceOf(Array)
  })

  it('beleg_hochladen creates a receipt and assigns tax year', async () => {
    const client = await connectClient()
    const res = await client.callTool({
      name: 'beleg_hochladen',
      arguments: {
        fileName: 'spendenquittung.pdf',
        kind: 'Sonstiges',
        taxYear: YEAR,
        belegdatum: '2025-11-01',
      },
    })
    const parsed = JSON.parse(getText(res))

    expect(parsed.dateiname).toBe('spendenquittung.pdf')
    expect(parsed.steuerjahr).toBe(YEAR)
    expect(parsed.status).toBe('erfasst')

    const receipts = await receiptService.list(USER)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.fileName).toBe('spendenquittung.pdf')
  })

  it('zahllink_anfordern returns Stripe checkout link for the user', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'zahllink_anfordern', arguments: { taxYear: YEAR } })
    const parsed = JSON.parse(getText(res))

    expect(parsed.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
    expect(parsed.hinweis).toContain('im Browser abgeschlossen')
  })

  it('enforces OAuth scopes and throws if scope was not granted', async () => {
    // Assistant with only read scope
    const readOnlyClient = await connectClient({
      clientId: 'read-only',
      clientName: 'ReadOnlyAssistant',
      scopes: ['steuerdaten:read'],
    })

    // Reading works
    const readRes = await readOnlyClient.callTool({ name: 'haushalt_ueberblick', arguments: { taxYear: YEAR } })
    expect(getText(readRes)).toBeTruthy()

    // Writing fails with error
    const writeRes = await readOnlyClient.callTool({
      name: 'maske_eintragen',
      arguments: {
        taxYear: YEAR,
        screen: 'lstb',
        field: 'bruttoarbeitslohn',
        value: '50000',
      },
    })
    expect(writeRes.isError).toBe(true)
    expect(getText(writeRes)).toContain('Fehlender OAuth-Scope: steuerdaten:write')
  })
})
