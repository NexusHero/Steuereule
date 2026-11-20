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

const A1 = { person: 'A', business: 1 } as const
const B1 = { person: 'B', business: 1 } as const

const commute: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _j, e) => e }

function setup() {
  const pension = new FakePensionRepository()
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const repository = new FakeBusinessRepository()
  const business = new BusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory())
  const service = new TaxEstimateService(
    lstb, interview, new FakeChSalaryCertificateRepository(), new FakeMasterDataRepository(), commute,
    new FakeLinkRepository(), new FakeChildRepository(), new FakeRentalRepository(), pension, undefined, business,
  )
  return { interview, business, service, pension, lstb }
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
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 4_000_000 }])
    const low = await service.getState('u', 2025)
    expect(low.kind).toBe('spanne')
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 2_000_000 }])
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

  it('deducts the provision the self-employed pay themselves: pension and KV/PV, the Krankengeld cut once (ADR-0101 §22)', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { interview, business, service } = setup()
    interview.seed('u', 2025, SELF_EMPLOYED)
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 6_000_000 }])
    interview.seed('u', 2025, { 'kv-pv': 'Ja', 'kv-pv-art': 'Gesetzlich (freiwillig)', 'kv-krankengeld': 'Ja', 'kv-pv-betrag': '6000', 'pv-betrag': '1200', 'kv-wahl-betrag': '0' })
    const healthOnly = await service.getState('u', 2025)
    interview.seed('u', 2025, { altersvorsorge: 'Ja', 'av-rv-betrag': '0', 'av-versorgungswerk-betrag': '10000', 'av-basisrente-betrag': '0', 'av-ksk': 'Nein' })
    const withPension = await service.getState('u', 2025)
    if (healthOnly.kind !== 'spanne' || withPension.kind !== 'spanne') throw new Error('expected ranges')
    // 6.000 € KV less 4 % (240 €) plus 1.200 € PV — not 4 % off the care insurance, not twice.
    expect(healthOnly.provision).toEqual({ from: 6960, to: 6960 })
    expect(withPension.provision).toEqual({ from: 16_960, to: 16_960 })
    expect(withPension.result.to).toBeGreaterThan(healthOnly.result.to)
  })

  it('a pensioner with a business: the pension and the profit are taxed together (ADR-0101 §22)', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { interview, business, service, pension } = setup()
    interview.seed('u', 2025, { job: 'Rente', 'rente-selbststaendig': 'Ja', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    await expect(service.getState('u', 2025)).resolves.toEqual({ kind: 'offen', missing: ['selbststaendig'] })
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 2_000_000 }])
    await expect(service.getState('u', 2025)).resolves.toEqual({ kind: 'offen', missing: ['rente'] })
    pension.seed({ userId: 'u', taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '18000', rentenbeginnJahr: '2019', alterBeiRentenbeginn: null })
    const small = await service.getState('u', 2025)
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 2_000_000 }])
    const large = await service.getState('u', 2025)
    if (small.kind !== 'spanne' || large.kind !== 'spanne') throw new Error('expected ranges')
    expect(large.incomeTax.to).toBeGreaterThan(small.incomeTax.to)
    expect(small.result.to).toBeLessThan(0)
  })

  it('a self-employed person with a Midijob: the business and the wage tax certificate together, the wage tax credited (ADR-0101 §22)', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { interview, business, service, lstb } = setup()
    interview.seed('u', 2025, { ...SELF_EMPLOYED, nebenjob: 'Midijob', 'nebenjob-brutto': '18000' })
    await business.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 3_000_000 }])
    const withoutCertificate = await service.getState('u', 2025)
    expect(withoutCertificate.kind).toBe('offen')
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '18000', lohnsteuer: '900', sozialversicherung: '3600' })
    const both = await service.getState('u', 2025)
    if (both.kind !== 'spanne') throw new Error(`expected a range, got ${both.kind}`)
    expect(both.anrechnung).toBe(900)
    expect(both.werbungskosten).toBe(1230)
  })
})
