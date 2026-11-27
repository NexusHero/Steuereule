import { describe, expect, it, vi } from 'vitest'
import { AMOUNT_LATER } from '@steuereule/core'
import { PDFDocument } from 'pdf-lib'
import { AuditService } from '../src/audit/audit.service.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import { UnlockService } from '../src/unlock/unlock.service.js'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import type { PaymentProvider } from '../src/unlock/payment-provider.js'
import type { UnlockRepository } from '../src/unlock/unlock.repository.js'
import { fixedUnlockRepository, stubPaymentProvider } from './fakes/fake-unlock.repository.js'
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
import { isSummaryPage, summaryPageCount } from './support/pdf-pages.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'

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

    const unlockRepo: UnlockRepository = fixedUnlockRepository(true)
    const paymentProvider: PaymentProvider = stubPaymentProvider('cs_1')
    const commuteRepo: CommuteRepository = {
      findForUserAndYear: async () => null,
      save: async (_u, _y, e) => e,
    }

    const service = new PrintoutService(taxCaseReaderOver({ profile: profileRepo, masterData: masterDataRepo, wageTaxCertificate: lstbRepo, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: new FakeChSalaryCertificateRepository(), children: new FakeChildRepository(), coupling: new FakeLinkRepository(), interview: interviewRepo, commute: commuteRepo }), new FakeMarkingRepository(), new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'), new AuditService(new FakeAuditRepository()), TEMPLATES_BASE)

    const pdfBytes = await service.create('u1', 2025, { editable: true })
    const pdf = await PDFDocument.load(pdfBytes)
    const names = pdf.getForm().getFields().map((f) => f.getName())
    expect(names.some((n) => n.startsWith('anlSo.'))).toBe(false)
  })
})

describe('PrintoutService: the summary leads the paid printout', () => {
  async function paidService(estimate: { getState: () => Promise<{ kind: string; result?: { from: number; to: number } }> } | undefined) {
    const profileRepo = new FakeProfileRepository()
    const masterDataRepo = new FakeMasterDataRepository()
    const lstbRepo = new FakeLstbRepository()
    await profileRepo.upsert('u9', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
    await masterDataRepo.save('u9', {
      geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden',
      religion: 'VD', familienstand: 'ledig', iban: 'DE89370400440532013000', finanzamt: 'Dresden-Nord',
    } as never)
    lstbRepo.seed({ userId: 'u9', taxYear: 2025, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
    const commuteRepo: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }
    const audit = new FakeAuditRepository()
    const service = new PrintoutService(
      taxCaseReaderOver({ profile: profileRepo, masterData: masterDataRepo, wageTaxCertificate: lstbRepo, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: new FakeChSalaryCertificateRepository(), children: new FakeChildRepository(), coupling: new FakeLinkRepository(), interview: new FakeInterviewAnswerRepository(), commute: commuteRepo }),
      new FakeMarkingRepository(),
      new UnlockService(fixedUnlockRepository(true), stubPaymentProvider('cs_9'), 'http://localhost:8081'),
      new AuditService(audit),
      TEMPLATES_BASE,
      undefined,
      estimate,
    )
    return service
  }

  const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount()

  it('puts its pages in front of the Vordrucke', async () => {
    const service = await paidService({ getState: async () => ({ kind: 'spanne', result: { from: 880, to: 950 } }) })
    const pdf = await PDFDocument.load(await service.create('u9', 2025))
    expect(isSummaryPage(pdf, 0)).toBe(true)
    expect(isSummaryPage(pdf, pdf.getPageCount() - 1)).toBe(false)
    // The summary is in front as a block: no Vordruck page comes before one of its pages.
    const kinds = pdf.getPageIndices().map((index) => isSummaryPage(pdf, index))
    expect(kinds.indexOf(false)).toBe(summaryPageCount(pdf))
  })

  it('still leads the printout when the estimate cannot be read: the forms the user paid for come either way', async () => {
    const failing = await paidService({ getState: async () => Promise.reject(new Error('estimate down')) })
    const without = await paidService(undefined)
    expect(await pagesOf(await failing.create('u9', 2025))).toBe(await pagesOf(await without.create('u9', 2025)))
  })

  it('keeps the fields of an editable printout fillable behind its pages', async () => {
    const service = await paidService({ getState: async () => ({ kind: 'offen' }) })
    const pdf = await PDFDocument.load(await service.create('u9', 2025, { editable: true }))
    expect(pdf.getForm().getFields().length).toBeGreaterThan(0)
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
    const unlockRepo: UnlockRepository = fixedUnlockRepository(false)
    const paymentProvider: PaymentProvider = stubPaymentProvider('cs_2')
    return new PrintoutService(taxCaseReaderOver({ profile: profileRepo, masterData: masterDataRepo, wageTaxCertificate: lstbRepo, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: new FakeChSalaryCertificateRepository(), children: new FakeChildRepository(), coupling: new FakeLinkRepository(), interview: new FakeInterviewAnswerRepository(), commute: commuteRepo }), new FakeMarkingRepository(), new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'), new AuditService(new FakeAuditRepository()), TEMPLATES_BASE)
  }

  it('names a value too long for its box before the user pays', async () => {
    const service = await serviceWith('Beispielstadt-Nord, Industriegebiet Am Langen Graben, Halle 7, Tor 3, Hintereingang', 2025)
    expect((await service.check('u2', 2025)).missing).toContain('zuLang.anlN.wegOrt')
  })

  it('finds the overflow without writing a PDF: the check runs on every open of the screen (API-6)', async () => {
    const service = await serviceWith('Beispielstadt-Nord, Industriegebiet Am Langen Graben, Halle 7, Tor 3, Hintereingang', 2025)
    const save = vi.spyOn(PDFDocument.prototype, 'save')
    const copyPages = vi.spyOn(PDFDocument.prototype, 'copyPages')
    try {
      expect((await service.check('u2', 2025)).missing).toEqual(['zuLang.anlN.wegOrt'])
      expect(save).not.toHaveBeenCalled()
      expect(copyPages).not.toHaveBeenCalled()
    } finally {
      save.mockRestore()
      copyPages.mockRestore()
    }
  })

  it('checks a 2024 return on the 2024 forms', async () => {
    const service = await serviceWith('01067 Dresden', 2024)
    expect((await service.check('u2', 2024)).missing.filter((m) => m.startsWith('zuLang.'))).toEqual([])
  })
})

// Real-data run: the printout was blocked while the IBAN was missing, also for a return with a payment.
describe('PrintoutService check: the IBAN is only needed for a refund', () => {
  async function serviceWithout(result: { from: number; to: number } | null, unlocked = false) {
    const profileRepo = new FakeProfileRepository()
    const masterDataRepo = new FakeMasterDataRepository()
    const lstbRepo = new FakeLstbRepository()
    await profileRepo.upsert('u3', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
    await masterDataRepo.save('u3', {
      geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden',
      religion: 'VD', familienstand: 'ledig', iban: null, finanzamt: 'Dresden-Nord',
    } as never)
    lstbRepo.seed({ userId: 'u3', taxYear: 2025, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
    const commuteRepo: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }
    const unlockRepo: UnlockRepository = fixedUnlockRepository(unlocked)
    const paymentProvider: PaymentProvider = stubPaymentProvider('cs_3')
    const estimate = { getState: async () => (result === null ? { kind: 'offen' as const } : { kind: 'spanne' as const, result }) }
    return new PrintoutService(taxCaseReaderOver({ profile: profileRepo, masterData: masterDataRepo, wageTaxCertificate: lstbRepo, pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: new FakeChSalaryCertificateRepository(), children: new FakeChildRepository(), coupling: new FakeLinkRepository(), interview: new FakeInterviewAnswerRepository(), commute: commuteRepo }), new FakeMarkingRepository(), new UnlockService(unlockRepo, paymentProvider, 'http://localhost:8081'), new AuditService(new FakeAuditRepository()), TEMPLATES_BASE, undefined, estimate as never)
  }

  it('names a missing IBAN as a hint, not a block, when the estimate is a payment', async () => {
    const check = await (await serviceWithout({ from: -900, to: -400 })).check('u3', 2025)
    expect(check.missing).not.toContain('iban')
    expect(check.hints).toEqual(['iban'])
  })

  it('prints the paid return without an IBAN when the estimate is a payment: the gate agrees with the check', async () => {
    const pdf = await (await serviceWithout({ from: -900, to: -400 }, true)).create('u3', 2025)
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0)
  })

  it('refuses the paid return without an IBAN while a refund is possible', async () => {
    await expect((await serviceWithout({ from: -200, to: 300 }, true)).create('u3', 2025)).rejects.toMatchObject({ response: { missing: ['iban'] } })
  })

  it('keeps it a block while a refund is possible, or the estimate is open', async () => {
    for (const result of [{ from: -200, to: 300 }, { from: 400, to: 900 }, null]) {
      const check = await (await serviceWithout(result)).check('u3', 2025)
      expect(check.missing).toContain('iban')
      expect(check.hints).toEqual([])
    }
  })
})

describe('PrintoutService: a joint year Person B has not agreed to (decision 3, API-3)', () => {
  it('holds the return back, shows no form value and reads nothing of Person B', async () => {
    const profileRepo = new FakeProfileRepository()
    const masterDataRepo = new FakeMasterDataRepository()
    const lstbRepo = new FakeLstbRepository()
    const linkRepo = new FakeLinkRepository()
    await profileRepo.upsert('a', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' })
    await profileRepo.upsert('b', { firstName: 'Bernd', lastName: 'Geheim', steuerId: '65929970489', steuernummer: null })
    await masterDataRepo.save('a', {
      geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden',
      religion: 'VD', familienstand: 'verheiratet', iban: 'DE02120300000000202051', finanzamt: 'Dresden-Nord',
    } as never)
    lstbRepo.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '42000', lohnsteuer: '6000', sozialversicherung: '8000' })
    lstbRepo.seed({ userId: 'b', taxYear: 2025, bruttoarbeitslohn: '77777', lohnsteuer: '9000', sozialversicherung: '9000' })
    await linkRepo.upsert('a', 2025, { personBUserId: 'b', filingType: 'zusammen', personBConsentedAt: null })
    const readsOfB: string[] = []
    const watched = <T extends object>(name: string, repository: T): T =>
      new Proxy(repository, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver) as unknown
          if (typeof value !== 'function') return value
          return (...args: unknown[]) => {
            if (args[0] === 'b') readsOfB.push(`${name}.${String(property)}`)
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        },
      })
    const markings = new FakeMarkingRepository()
    const commuteRepo: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }
    const service = new PrintoutService(
      taxCaseReaderOver({ profile: watched('profile', profileRepo), masterData: watched('masterData', masterDataRepo), wageTaxCertificate: watched('lstb', lstbRepo), pension: watched('pension', new FakePensionRepository()), capital: new FakeCapitalRepository(), rental: new FakeRentalRepository(), salaryStatement: watched('ch', new FakeChSalaryCertificateRepository()), children: new FakeChildRepository(), coupling: linkRepo, interview: watched('interview', new FakeInterviewAnswerRepository()), commute: watched('commute', commuteRepo) }),
      watched('markings', markings), new UnlockService(fixedUnlockRepository(false), stubPaymentProvider('cs_4'), 'http://localhost:8081'), new AuditService(new FakeAuditRepository()), TEMPLATES_BASE, undefined, { getState: async () => ({ kind: 'offen' as const }) } as never,
    )

    const check = await service.check('a', 2025)
    expect(check.missing).toContain('personB.zustimmung')
    expect(await service.fillInValues('a', 2025)).toEqual({ forms: [], names: {}, unconfirmed: ['personB.zustimmung'] })
    expect((await service.liveValues('a', 2025)).forms).toEqual([])
    expect(readsOfB).toEqual([])

    // Once B agreed, B's figures belong to the joint return.
    await linkRepo.upsert('a', 2025, { personBUserId: 'b', filingType: 'zusammen', personBConsentedAt: new Date('2026-02-01T08:00:00Z') })
    expect((await service.check('a', 2025)).missing).not.toContain('personB.zustimmung')
    expect(readsOfB.length).toBeGreaterThan(0)
  })
})
