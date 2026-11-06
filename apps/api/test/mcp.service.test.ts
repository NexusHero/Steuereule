import { beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpService, type AssistantSessionInfo } from '../src/mcp/mcp.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
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

    receiptService = new ReceiptService(receiptRepo, auditService)

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

  it('lists all 6 domain-specific tools with clear schemas', async () => {
    const client = await connectClient()
    const result = await client.listTools()
    const toolNames = result.tools.map((t) => t.name).sort()

    expect(toolNames).toEqual([
      'ausdruck_vorpruefung',
      'beleg_hochladen',
      'eulen_hinweise',
      'maske_eintragen',
      'steuerjahr_stand',
      'zahllink_anfordern',
    ])
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
