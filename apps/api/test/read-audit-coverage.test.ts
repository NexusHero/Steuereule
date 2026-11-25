// API-15 / table 3 N4: twelve tax-data read paths wrote no READ row into the access trail while their
// siblings (lstb, kapital, rente …) do. Each read below is called with fakes and must append one. A read
// of Person B's figures is the caller's row (A's own export shows it); a Person B with an own account
// gets a row of their own, marked `source: 'partner'`.
import { describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import type { AuditEntry } from '../src/audit/audit.repository.js'
import { appendReadAudit } from '../src/common/read-audit.js'
import { currentDatabaseIdentity, runAsDatabaseUser } from '../src/common/database-identity.js'
import { CommuteService } from '../src/commute/commute.service.js'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import { AssessmentComparisonService } from '../src/filing-type-comparison/filing-type-comparison.service.js'
import { CapitalService } from '../src/capital/capital.service.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import { TakeoverService } from '../src/takeover/takeover.service.js'
import { KnownEmployersService } from '../src/ch-salary-certificate/known-employers.service.js'
import { BusinessProfileService } from '../src/business/business-profile.service.js'
import { BusinessExportService } from '../src/business/business-export.service.js'
import { AdvisorProjectNotes } from '../src/advisor/advisor-project-notes.js'
import { AdvisorConversations } from '../src/advisor/advisor-conversations.js'
import { LinkService } from '../src/link/link.service.js'
import { EMPTY_N_GRE, type CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import type { TaxCaseReader, TaxCaseRecords } from '../src/tax-case/tax-case.reader.js'
import type { PartnerCouplingRecord } from '../src/link/link.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'

const YEAR = 2025
const A = 'user-a'

function trail() {
  const repository = new FakeAuditRepository()
  const audit = new AuditService(repository)
  const reads = (): AuditEntry[] => repository.all().filter((row) => row.action === 'READ').map(({ userId, action, resource, source }) => ({ userId, action, resource, ...(source ? { source } : {}) }))
  return { audit, reads }
}

/** A tax-case reader over fixed records: what a part is not given reads as empty. */
function readerOf(records: Partial<TaxCaseRecords> = {}): TaxCaseReader {
  const empty: TaxCaseRecords = {
    wageTaxCertificate: null,
    salaryStatement: null,
    commute: null,
    interviewRows: [],
    masterData: null,
    profile: null,
    pension: null,
    capital: null,
    rentals: [],
    children: [],
    coupling: null,
  }
  return {
    read: async (_userId, _year, parts) => Object.fromEntries(parts.map((part) => [part, { ...empty, ...records }[part]])) as never,
  }
}

function coupling(personBUserId: string): PartnerCouplingRecord {
  return { id: 'c1', personAUserId: A, personBUserId, taxYear: YEAR, filingType: 'zusammen', invitationCode: null, invitationCodeValidUntil: null }
}

function linkService() {
  return new LinkService(new FakeLinkRepository(), new FakeProfileRepository(), new FakeMasterDataRepository(), { append: () => Promise.resolve() } as never)
}

const WAY = { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 20, oneWayKm: 30, transport: 'pkw', workplace: 'Lörrach' } as const

describe('appendReadAudit', () => {
  it('writes the caller row and one partner row only for a Person B with an own account', async () => {
    const { audit, reads } = trail()
    await appendReadAudit(audit, A, 'cockpit', [`spouse_${A}_${YEAR}`, 'user-b', 'user-b', A, null])
    expect(reads()).toEqual([
      { userId: A, action: 'READ', resource: 'cockpit' },
      { userId: 'user-b', action: 'READ', resource: 'cockpit', source: 'partner' },
    ])
  })
})

describe('READ audit coverage (API-15)', () => {
  it('commute: the caller reads their own way to work', async () => {
    const { audit, reads } = trail()
    const repository = new FakeCommuteRepository()
    await repository.save(A, YEAR, WAY as never)
    await new CommuteService(repository, audit).getState(A, YEAR)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'arbeitsweg' }])
  })

  it('commute: Person A reading a shadow Person B writes the row under A', async () => {
    const { audit, reads } = trail()
    const repository = new FakeCommuteRepository()
    const shadow = `spouse_${A}_${YEAR}`
    await repository.save(shadow, YEAR, WAY as never)
    await new CommuteService(repository, audit).getState(shadow, YEAR, A)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'arbeitsweg' }])
  })

  it('commute: nothing stored, nothing read, no row', async () => {
    const { audit, reads } = trail()
    await new CommuteService(new FakeCommuteRepository(), audit).getState(A, YEAR)
    expect(reads()).toEqual([])
  })

  it('cockpit: the summary of a joint return with a shadow Person B is A’s row', async () => {
    const { audit, reads } = trail()
    const taxYear = new FakeTaxYearRepository()
    taxYear.seed(A, { taxYear: YEAR, openItems: 0 })
    const link = linkService()
    await link.set(A, YEAR, { filingType: 'zusammen' })
    const shadow = await link.dataUser(A, YEAR, 'B')
    const interview = new FakeInterviewAnswerRepository()
    interview.seed(A, YEAR, { job: 'Angestellt' })
    const lstb = new FakeLstbRepository()
    lstb.seed({ userId: shadow, taxYear: YEAR, bruttoarbeitslohn: '30000', lohnsteuer: '3000', sozialversicherung: '5000' })
    const cases = taxCaseReaderOver({ interview, wageTaxCertificate: lstb })
    const service = new CockpitService(taxYear, cases, new FakeMarkingRepository(), link, undefined, undefined, audit)

    const summary = await service.getSummary(A, YEAR)

    expect(summary?.byPerson).toBeDefined()
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'cockpit' }])
  })

  it('tax estimate: a user read of a joint return with a Person B account writes A’s row and B’s partner row', async () => {
    const { audit, reads } = trail()
    const cases = readerOf({ interviewRows: [{ questionId: 'job', value: 'Angestellt' }] as never, coupling: coupling('user-b') })
    const service = new TaxEstimateService(cases, undefined, audit)
    vi.spyOn(service, 'getState').mockResolvedValue({ kind: 'offen', missing: ['einkommen'] })

    await service.readForUser(A, YEAR)

    expect(reads()).toEqual([
      { userId: A, action: 'READ', resource: 'steuerschaetzung' },
      { userId: 'user-b', action: 'READ', resource: 'steuerschaetzung', source: 'partner' },
    ])
  })

  it('tax estimate: the computation other services call writes no row', async () => {
    const { audit, reads } = trail()
    const service = new TaxEstimateService(readerOf({ interviewRows: [{ questionId: 'job', value: 'Angestellt' }] as never }), undefined, audit)
    await service.getState(A, YEAR)
    expect(reads()).toEqual([])
  })

  it('filing-type comparison', async () => {
    const { audit, reads } = trail()
    const taxYear = new FakeTaxYearRepository()
    taxYear.seed(A, { taxYear: YEAR, openItems: 0 })
    await new AssessmentComparisonService(taxYear, readerOf(), audit).getComparison(A, YEAR, false, undefined, 0)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'veranlagungsvergleich' }])
  })

  it('capital: the Günstigerprüfung', async () => {
    const { audit, reads } = trail()
    const taxYear = new FakeTaxYearRepository()
    taxYear.seed(A, { taxYear: YEAR, openItems: 0 })
    const capital = new FakeCapitalRepository()
    capital.seed({ userId: A, taxYear: YEAR, kapitalertraege: '1200' })
    const service = new CapitalService(capital, new FakeInterviewAnswerRepository(), taxYear, audit, { getState: () => Promise.reject(new Error('not reached')) } as never)

    await service.getMostFavourableCheck(A, YEAR, 0)

    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'guenstigerpruefung' }])
  })

  it('printout: the check before payment, for the user, with Person B’s account named', async () => {
    const { audit, reads } = trail()
    const service = new PrintoutService(readerOf({ coupling: coupling('user-b') }), new FakeMarkingRepository(), {} as never, audit, new URL('file:///nowhere/'))
    vi.spyOn(service, 'check').mockResolvedValue({ missing: [], missingChildFields: [], hints: [] } as never)

    await service.checkForUser(A, YEAR)

    expect(reads()).toEqual([
      { userId: A, action: 'READ', resource: 'ausdruck-pruefung' },
      { userId: 'user-b', action: 'READ', resource: 'ausdruck-pruefung', source: 'partner' },
    ])
  })

  it('takeover: the marked taken-over values', async () => {
    const { audit, reads } = trail()
    const markings = new FakeMarkingRepository()
    await markings.save(A, YEAR, { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'uebernahme', lastYear: YEAR - 1 }, confirmed: false, proposal: null })
    const none = {} as never
    await new TakeoverService(markings, none, none, none, none, none, none, audit).getState(A, YEAR)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'uebernahme' }])
  })

  it('known employers: the household’s employers, Person B (shadow) included, are A’s row', async () => {
    const { audit, reads } = trail()
    const ch = new FakeChSalaryCertificateRepository()
    const link = linkService()
    await link.set(A, YEAR, { filingType: 'zusammen' })
    const shadow = await link.dataUser(A, YEAR, 'B')
    ch.seed(certificate(shadow, 'Cilag AG'))

    const list = await new KnownEmployersService(ch, link, audit).list(A)

    expect(list.map((e) => e.name)).toEqual(['Cilag AG'])
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'arbeitgeber' }])
  })

  it('business: the list of businesses', async () => {
    const { audit, reads } = trail()
    const repository = { listProfiles: async () => [{ business: 1, name: 'Atelier', kind: 'freiberuf', mode: 'euer' }] }
    const context = { assertOpen: async () => undefined }
    await new BusinessProfileService(repository as never, audit, context as never).listBusinesses(A, YEAR, 'A')
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'selbststaendig' }])
  })

  it('business: the Verfahrensdokumentation, but not the read-back after saving it', async () => {
    const { audit, reads } = trail()
    const repository = { saveProfile: async () => ({}) }
    const context = { assertOpen: async () => undefined, frame: async () => ({ chart: 'SKR03', mode: 'euer', profile: { name: 'Atelier', procedureDoc: null } }) }
    const service = new BusinessExportService(repository as never, audit, context as never, {} as never)

    await service.procedureDoc(A, YEAR, { person: 'A', business: 1 })
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'selbststaendig' }])

    await service.saveProcedureDoc(A, YEAR, { person: 'A', business: 1 }, {})
    expect(reads()).toHaveLength(1)
  })

  it('advisor: the project notes', async () => {
    const { audit, reads } = trail()
    const note = { id: 'n1', userId: A, taxYear: YEAR, text: 'Arbeitsweg 40 km.', author: 'user', createdAt: new Date(), updatedAt: new Date() }
    const repository = { listNotes: async () => [note] }
    await new AdvisorProjectNotes(repository as never, {} as never, audit).listNotes(A, YEAR)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'berater_notiz' }])
  })

  it('advisor: the conversation list', async () => {
    const { audit, reads } = trail()
    const conversation = { id: 'c1', userId: A, taxYear: YEAR, title: null, createdAt: new Date(), lastUsedAt: new Date(), chatModel: null }
    const repository = { defaultConversation: async () => conversation, listConversations: async () => [conversation] }
    await new AdvisorConversations(null, repository as never, audit, {} as never).listConversations(A, YEAR)
    expect(reads()).toEqual([{ userId: A, action: 'READ', resource: 'berater_gespraeche' }])
  })
})

function certificate(userId: string, name: string): CrossBorderSalaryStatementRecord {
  return {
    userId,
    taxYear: YEAR,
    fields: {} as CrossBorderSalaryStatementRecord['fields'],
    bemerkungen: null,
    saeule3aChf: null,
    krankenkasseChf: null,
    exchangeRateMonth: null,
    exchangeRateValue: null,
    exchangeRateMode: null,
    exchangeRateReceiptId: null,
    nGre: { ...EMPTY_N_GRE, arbeitgeberName: name },
  }
}

describe('the partner row of a read is the one cross-user write (P11)', () => {
  it("writes both rows as the caller: the access-log policy, not a system path, allows B's partner row", async () => {
    const written: { userId: string; identity: unknown }[] = []
    const audit = { append: async (entry: { userId: string }) => void written.push({ userId: entry.userId, identity: currentDatabaseIdentity() }) }

    await runAsDatabaseUser('person-a', () => appendReadAudit(audit, 'person-a', 'lstb', ['person-b', 'spouse_person-a_2025']))

    expect(written).toEqual([
      { userId: 'person-a', identity: { kind: 'user', userId: 'person-a' } },
      { userId: 'person-b', identity: { kind: 'user', userId: 'person-a' } },
    ])
  })
})

describe('partnerSourceFor: the marker of a row in somebody else\'s trail', () => {
  it("is 'partner' only when the request's user writes into another person's trail", async () => {
    const { partnerSourceFor } = await import('../src/common/read-audit.js')
    expect(runAsDatabaseUser('person-b', () => partnerSourceFor('person-a'))).toBe('partner')
    expect(runAsDatabaseUser('person-a', () => partnerSourceFor('person-a'))).toBeNull()
    // A Person B kept under A's shadow id is A's own row.
    expect(runAsDatabaseUser('person-a', () => partnerSourceFor('spouse_person-a_2025'))).toBeNull()
    // Outside a user (a system path) nothing is marked: the system path is the writer.
    expect(partnerSourceFor('person-a')).toBeNull()
  })
})
