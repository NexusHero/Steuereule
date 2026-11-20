// ADR-0101 + REQ-015 amended: the estimate of the self-employed. Switch off: exactly as before
// (`nur-angestellte`, the Gewerbe gating). Switch on: the book's profit goes into the core estimate.
import { afterEach, describe, expect, it } from 'vitest'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { BusinessService } from '../src/business/business.service.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'

const commute: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _j, e) => e }

function setup() {
  const interview = new FakeInterviewAnswerRepository()
  const repository = new FakeBusinessRepository()
  const business = new BusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory())
  const service = new TaxEstimateService(
    new FakeLstbRepository(), interview, new FakeChSalaryCertificateRepository(), new FakeMasterDataRepository(), commute,
    new FakeLinkRepository(), new FakeChildRepository(), new FakeRentalRepository(), new FakePensionRepository(), undefined, business,
  )
  return { interview, business, service }
}

const SELF_EMPLOYED = { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

describe('tax estimate of the self-employed (ADR-0101)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('switch off: unchanged, the self-employed get no estimate', async () => {
    delete process.env.SELBSTSTAENDIGE_ENABLED
    const { interview, service } = setup()
    interview.seed('u', 2025, SELF_EMPLOYED)
    await expect(service.getState('u', 2025)).resolves.toEqual({ kind: 'nicht-moeglich', reason: 'nur-angestellte' })
  })

  it('switch on without a book: the business is the open item', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { interview, service } = setup()
    interview.seed('u', 2025, SELF_EMPLOYED)
    await expect(service.getState('u', 2025)).resolves.toEqual({ kind: 'offen', missing: ['selbststaendig'] })
  })

  it('switch on: the profit of the book is taxed, a higher profit costs more tax, prepayments count once', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { interview, business, service } = setup()
    interview.seed('u', 2025, SELF_EMPLOYED)
    await business.quickEntry('u', 2025, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 4_000_000 }])
    const low = await service.getState('u', 2025)
    expect(low.kind).toBe('spanne')
    await business.quickEntry('u', 2025, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 2_000_000 }])
    const high = await service.getState('u', 2025)
    if (low.kind !== 'spanne' || high.kind !== 'spanne') throw new Error('expected ranges')
    // The result is a refund (+) or back-payment (−): more profit, more to pay.
    expect(high.result.to).toBeLessThan(low.result.to)

    interview.seed('u', 2025, { 'vorauszahlungen-gate': 'Ja', 'vorauszahlungen-betrag': '3000' })
    const prepaid = await service.getState('u', 2025)
    if (prepaid.kind !== 'spanne') throw new Error('expected a range')
    expect(prepaid.prepayments).toBe(3000)
    expect(prepaid.result.to - high.result.to).toBeGreaterThanOrEqual(3000)
    expect(prepaid.result.to - high.result.to).toBeLessThan(3000 * 1.1)
  })
})
