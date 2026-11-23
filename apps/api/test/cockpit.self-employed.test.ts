// ADR-0101: the Cockpit's income sum includes the business profit of the book (switch on); off, nothing changes.
import { afterEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { BusinessService } from '../src/business/business.service.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'

const A1 = { person: 'A', business: 1 } as const

async function setup() {
  const taxYear = new FakeTaxYearRepository()
  const interview = new FakeInterviewAnswerRepository()
  const business = new BusinessService(new FakeBusinessRepository(), interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory())
  const service = new CockpitService(taxYear, taxCaseReaderOver({ wageTaxCertificate: new FakeLstbRepository(), interview, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: new FakeChSalaryCertificateRepository() }), new FakeMarkingRepository(), undefined, undefined, business)
  taxYear.seed('u', { taxYear: 2025, openItems: 0 })
  interview.seed('u', 2025, { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
  return { service, business }
}

describe('Cockpit sum with the business profit (ADR-0101)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('switch on: the profit of the book counts in the sum', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { service, business } = await setup()
    await business.quickEntry('u', 2025, A1, [
      { key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 },
      { key: 'ausgaben_telekommunikation', amountCents: 200_000 },
    ])
    const summary = await service.getSummary('u', 2025)
    expect(summary?.status).toMatchObject({ kind: 'bestimmt', value: 48_000 })
    expect(summary?.filingPath).toBe('elster-ausfuellhilfe')
  })

  it('switch off: the self-employed stay gated, no profit is read', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    const { service } = await setup()
    const summary = await service.getSummary('u', 2025)
    expect(summary?.status).toMatchObject({ kind: 'gated', gated: ['Gewerbe'] })
    expect(summary?.filingPath).toBe('papier')
  })
})
