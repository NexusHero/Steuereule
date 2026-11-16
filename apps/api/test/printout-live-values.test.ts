import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import { UnlockService } from '../src/unlock/unlock.service.js'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import type { PaymentProvider } from '../src/unlock/payment-provider.js'
import type { UnlockRepository } from '../src/unlock/unlock.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const TEMPLATES_BASE = new URL('../assets/vordrucke/', import.meta.url)

async function setup() {
  const profile = new FakeProfileRepository()
  const masterData = new FakeMasterDataRepository()
  const lstb = new FakeLstbRepository()
  const children = new FakeChildRepository()
  const rental = new FakeRentalRepository()
  const audit = new FakeAuditRepository()

  await profile.upsert('u1', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
  await masterData.save('u1', {
    geburtsdatum: '1990-04-12',
    strasse: 'Musterstraße',
    hausnummer: '12',
    plz: '01067',
    wohnort: 'Dresden',
    familienstand: 'ledig',
    finanzamt: 'Dresden-Nord',
  } as never)
  lstb.seed({ userId: 'u1', taxYear: 2025, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
  const mia = await children.create('u1', 2025, { firstName: 'Mia', lastName: 'Beispiel', geburtsdatum: '2018-03-01' })
  const ben = await children.create('u1', 2025, { firstName: 'Ben', lastName: 'Beispiel', geburtsdatum: '2020-07-09' })
  rental.seed({ id: 'obj-9', userId: 'u1', taxYear: 2025, mieteinnahmen: '9600', anschaffungskosten: null, baujahr: null, werbungskosten: null, strasse: 'Hafenweg', hausnummer: '3', plz: '01069', city: 'Dresden' })

  // Not paid: the live values must not depend on the unlock (only the PDF is paid, ADR-0050).
  const unlockRepo: UnlockRepository = { isPaid: async () => false, createOpenOnes: async () => {}, markPaid: async () => {} }
  const paymentProvider: PaymentProvider = {
    createCheckout: async () => ({ id: 'cs_1', url: 'https://example.test' }),
    verifyEvent: () => ({ kind: 'bezahlt', sessionId: 'cs_1', amountCents: 3900 }),
  }
  const commute: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }

  const service = new PrintoutService(
    profile,
    masterData,
    lstb,
    new FakePensionRepository(),
    new FakeCapitalRepository(),
    rental,
    new FakeChSalaryCertificateRepository(),
    children,
    new FakeLinkRepository(),
    new FakeInterviewAnswerRepository(),
    new FakeMarkingRepository(),
    commute,
    new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'),
    new AuditService(audit),
    TEMPLATES_BASE,
  )
  return { service, audit, mia, ben }
}

describe('PrintoutService.liveValues (live form view)', () => {
  it('returns the values of every form instance before the printout is paid', async () => {
    const { service } = await setup()

    const { forms } = await service.liveValues('u1', 2025)

    const est = forms.find((f) => f.formular === 'est-1-a')
    expect(est?.instances).toHaveLength(1)
    expect(est?.instances[0]?.values['est1a.plz']).toBe('01067')
    const n = forms.find((f) => f.formular === 'anlage-n')
    expect(n?.instances[0]).toMatchObject({ person: 'A', entityId: null })
    expect(n?.instances[0]?.values['anlN.kz110']).toBe('42000')
  })

  it('tags each child and rental instance with the id of its record, in the order of the forms', async () => {
    const { service, mia, ben } = await setup()

    const { forms } = await service.liveValues('u1', 2025)

    const kinder = forms.find((f) => f.formular === 'anlage-kind')?.instances ?? []
    expect(kinder.map((k) => [k.entityId, k.values['anlKind.vorname']])).toEqual([
      [mia.id, 'Mia'],
      [ben.id, 'Ben'],
    ])
    const v = forms.find((f) => f.formular === 'anlage-v')?.instances ?? []
    expect(v).toHaveLength(1)
    expect(v[0]?.entityId).toBe('obj-9')
  })

  it('keeps single-instance values on their own form, never on another one', async () => {
    const { service } = await setup()

    const { forms } = await service.liveValues('u1', 2025)

    for (const form of forms) {
      for (const instance of form.instances) {
        for (const id of Object.keys(instance.values)) {
          expect(service.formOfField(2025, id), `${form.formular}: ${id}`).toBe(form.formular)
        }
      }
    }
  })

  it('records the read in the audit log', async () => {
    const { service, audit } = await setup()

    await service.liveValues('u1', 2025)

    expect(audit.all().some((e) => e.resource === 'ausdruck-werte' && e.action === 'READ')).toBe(true)
  })
})
