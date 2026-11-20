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
      'einkommensteuer_berechnen',
      'eulen_hinweise',
      'gesetzestext_lesen',
      'gewerbesteuer_schaetzen',
      'kapitalertraege_guenstigerpruefung',
      'kleinunternehmer_pruefen',
      'maske_eintragen',
      'maske_felder',
      'rechtsquelle_nachschlagen',
      'renovierung_15_prozent_pruefen',
      'schenkungsteuer_berechnen',
      'spekulationsfrist_pruefen',
      'steuerjahr_stand',
      'steuerwissen_lesen',
      'veranlagungsarten_vergleichen',
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
      simulate: async () => ({ ok: true, beforeRefundEur: 100, afterRefundEur: 250, deltaEur: 150 }),
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
    const report = { simulate: vi.fn() }
    const withReport = new McpService(cockpitService, printoutService, confirmationService, owlModeService, receiptService, unlockService, profileRepo, masterDataRepo, auditService, report as never)
    const server = withReport.createServer(USER, { ...ALL_SCOPES_ASSISTANT, scopes: ['steuerdaten:read'] })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(clientTransport)
    const res = await client.callTool({ name: 'auswirkung_simulieren', arguments: { taxYear: YEAR, screen: 'lstb', field: 'bruttoarbeitslohn', value: '50000' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('steuerdaten:write')
    expect(report.simulate).not.toHaveBeenCalled()
  })

  it('auswirkung_simulieren refuses a target the advisor would refuse and stores nothing', async () => {
    const report = { simulate: async () => { throw new Error('must not run') } }
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
      expect(parsed.kinder).toEqual([{ instance: 'kind-1', nummer: 1, vorname: 'Z***', geburtsjahr: '2022' }])
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

  it('maske_felder leaves out the fields an assistant never writes and the booking mask', async () => {
    const client = await connectClient()
    const kopplung = JSON.parse(getText(await client.callTool({ name: 'maske_felder', arguments: { screen: 'kopplung' } })))
    expect(kopplung.felder.map((f: { feld: string }) => f.feld)).toEqual(['filingType'])
    const buchung = await client.callTool({ name: 'maske_felder', arguments: { screen: 'buchung' } })
    expect(JSON.parse(getText(buchung)).ok).toBe(false)
  })

  it('maske_eintragen points a booking to the booking path instead of writing it as a field', async () => {
    const client = await connectClient()
    const res = await client.callTool({ name: 'maske_eintragen', arguments: { taxYear: YEAR, screen: 'buchung', field: 'betrag', value: '10' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    expect(getText(res)).toContain('USE_BOOKING_TOOL')
  })

  it('steuerjahr_stand masks all sensitive personal data (Steuer-ID, IBAN, address, name)', async () => {
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
    const res = await client.callTool({ name: 'steuerjahr_stand', arguments: { taxYear: YEAR } })
    const text = getText(res)
    const parsed = JSON.parse(text)

    expect(parsed.steuerjahr).toBe(YEAR)
    // PII masking checks
    expect(parsed.profil.firstName).toBe('M***')
    expect(parsed.profil.lastName).toBe('B***')
    expect(parsed.profil.steuerId).toBe('12*******01')
    expect(parsed.stammdaten.strasse).toBe('G***')
    expect(parsed.stammdaten.hausnummer).toBe('***')
    expect(parsed.stammdaten.iban).toBe('DE** **** **** **** **** 00')
    expect(parsed.stammdaten.telefon).toBe('07621 ***')
    // Non-PII is preserved
    expect(parsed.stammdaten.plz).toBe('4058')
    expect(parsed.stammdaten.wohnort).toBe('Basel')
    expect(parsed.stammdaten.beruf).toBe('Entwickler')
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
    const readRes = await readOnlyClient.callTool({ name: 'steuerjahr_stand', arguments: { taxYear: YEAR } })
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
