import { describe, expect, it } from 'vitest'
import { AMOUNT_LATER } from '@steuereule/core'
import { PDFDocument } from 'pdf-lib'
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

describe('PrintoutService with AMOUNT_LATER', () => {
  it('treats spenden-betrag=spaeter as not specified (omits Sonderausgaben donations instead of passing NaN)', async () => {
    const profileRepo = new FakeProfileRepository()
    const masterDataRepo = new FakeMasterDataRepository()
    const lstbRepo = new FakeLstbRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()

    await profileRepo.upsert('u1', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
    await masterDataRepo.save('u1', {
      geburtsdatum: '1990-04-12',
      strasse: 'Musterstraße',
      hausnummer: '12',
      plz: '01067',
      wohnort: 'Dresden',
      religion: 'VD',
      familienstand: 'ledig',
      iban: 'DE89370400440532013000',
      finanzamt: 'Dresden-Nord',
    } as never)
    lstbRepo.seed({ userId: 'u1', taxYear: 2025, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
    await interviewRepo.write({ userId: 'u1', taxYear: 2025, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: 'u1', taxYear: 2025, questionId: 'spenden-betrag', value: AMOUNT_LATER, openItems: 0 })

    const unlockRepo: UnlockRepository = {
      isPaid: async () => true,
      createOpenOnes: async () => {},
      markPaid: async () => {},
    }
    const paymentProvider: PaymentProvider = {
      createCheckout: async () => ({ id: 'cs_1', url: 'https://example.test' }),
      verifyEvent: () => ({ kind: 'bezahlt', sessionId: 'cs_1', amountCents: 3900 }),
    }
    const commuteRepo: CommuteRepository = {
      findForUserAndYear: async () => null,
      save: async (_u, _y, e) => e,
    }

    const service = new PrintoutService(
      profileRepo,
      masterDataRepo,
      lstbRepo,
      new FakePensionRepository(),
      new FakeCapitalRepository(),
      new FakeRentalRepository(),
      new FakeChSalaryCertificateRepository(),
      new FakeChildRepository(),
      new FakeLinkRepository(),
      interviewRepo,
      new FakeMarkingRepository(),
      commuteRepo,
      new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'),
      new AuditService(new FakeAuditRepository()),
      TEMPLATES_BASE,
    )

    const pdfBytes = await service.create('u1', 2025, { editable: true })
    const pdf = await PDFDocument.load(pdfBytes)
    const names = pdf.getForm().getFields().map((f) => f.getName())
    expect(names.some((n) => n.startsWith('anlSo.'))).toBe(false)
  })
})

describe('PrintoutService check before payment (ADR-0085)', () => {
  async function serviceWith(workplace: string, year: number) {
    const profileRepo = new FakeProfileRepository()
    const masterDataRepo = new FakeMasterDataRepository()
    const lstbRepo = new FakeLstbRepository()
    await profileRepo.upsert('u2', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
    await masterDataRepo.save('u2', {
      geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden',
      religion: 'VD', familienstand: 'ledig', iban: 'DE89370400440532013000', finanzamt: 'Dresden-Nord',
    } as never)
    lstbRepo.seed({ userId: 'u2', taxYear: year, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
    const commuteRepo: CommuteRepository = {
      findForUserAndYear: async () => ({ workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 0, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace, publicHolidays: null, publicHolidayRegion: null }),
      save: async (_u, _y, e) => e,
    }
    const unlockRepo: UnlockRepository = { isPaid: async () => false, createOpenOnes: async () => {}, markPaid: async () => {} }
    const paymentProvider: PaymentProvider = { createCheckout: async () => ({ id: 'cs_2', url: 'https://example.test' }), verifyEvent: () => ({ kind: 'bezahlt', sessionId: 'cs_2', amountCents: 3900 }) }
    return new PrintoutService(
      profileRepo, masterDataRepo, lstbRepo, new FakePensionRepository(), new FakeCapitalRepository(), new FakeRentalRepository(),
      new FakeChSalaryCertificateRepository(), new FakeChildRepository(), new FakeLinkRepository(), new FakeInterviewAnswerRepository(),
      new FakeMarkingRepository(), commuteRepo, new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'),
      new AuditService(new FakeAuditRepository()), TEMPLATES_BASE,
    )
  }

  it('names a value too long for its box before the user pays', async () => {
    const service = await serviceWith('Beispielstadt-Nord, Industriegebiet Am Langen Graben, Halle 7, Tor 3, Hintereingang', 2025)
    expect((await service.check('u2', 2025)).missing).toContain('zuLang.anlN.wegOrt')
  })

  it('checks a 2024 return on the 2024 forms', async () => {
    const service = await serviceWith('01067 Dresden', 2024)
    expect((await service.check('u2', 2024)).missing.filter((m) => m.startsWith('zuLang.'))).toEqual([])
  })
})
