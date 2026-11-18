// Regression (Echtdatentest 18.11.2026): the CH mask saves the basic health insurance (KVG) and the
// Säule 3a with one request each. Leaving the KVG field straight for the Säule 3a sends both at
// once; the save read the row and then wrote both columns, so the later request put back the
// value it had read and the KVG was gone (8 of 8 tries against the live API). A partial save
// must touch only its own column, without reading first.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChSalaryCertificateService } from '../src/ch-salary-certificate/ch-salary-certificate.service.js'
import { PrismaChSalaryCertificateRepository } from '../src/ch-salary-certificate/ch-salary-certificate.repository.prisma.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const YEAR = 2025

describe('CH provision saves that overlap', () => {
  it('keeps both values when the mask saves KVG and Säule 3a at the same time', async () => {
    const repository = new FakeChSalaryCertificateRepository()
    const service = new ChSalaryCertificateService(repository, new FakeInterviewAnswerRepository(), new AuditService(new FakeAuditRepository()))
    await Promise.all([service.setProvision('u', YEAR, { krankenkasseChf: 3593 }), service.setProvision('u', YEAR, { saeule3aChf: 0 })])
    expect(await repository.findForUserAndYear('u', YEAR)).toMatchObject({ krankenkasseChf: '3593', saeule3aChf: '0' })
  })

  it('keeps both values when owl drafts for KVG and Säule 3a are applied at the same time', async () => {
    const chSalaryCertificate = new FakeChSalaryCertificateRepository()
    const audit = new AuditService(new FakeAuditRepository())
    const access = fieldAccessFrom({
      lstb: new FakeLstbRepository(),
      pension: new FakePensionRepository(),
      capital: new FakeCapitalRepository(),
      rental: new FakeRentalRepository(),
      commute: new FakeCommuteRepository(),
      chSalaryCertificate,
      interview: new FakeInterviewAnswerRepository(),
    })
    const confirmation = new ConfirmationService(new FakeMarkingRepository(), access, audit)
    await Promise.all([
      confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.krankenkasseChf', '3593'),
      confirmation.writeConfirmedByAdvisor('u', YEAR, 'chLohnausweis.saeule3aChf', '0'),
    ])
    expect(await chSalaryCertificate.findForUserAndYear('u', YEAR)).toMatchObject({ krankenkasseChf: '3593', saeule3aChf: '0' })
  })

  it('writes only the column the request carries, so the database never sees a stale value', async () => {
    const updates: Record<string, unknown>[] = []
    const row = { userId: 'u', taxYear: YEAR, krankenkasseChf: '3593', saeule3aChf: null }
    const prisma = {
      chSalaryCertificate: {
        findUnique: () => Promise.reject(new Error('a partial save must not read first')),
        upsert: (args: { update: Record<string, unknown> }) => {
          updates.push(args.update)
          return Promise.resolve(row)
        },
      },
      taxDataAccessLog: { create: () => Promise.resolve({}) },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    }
    const repository = new PrismaChSalaryCertificateRepository(prisma as never)
    await repository.setProvision('u', YEAR, { saeule3aChf: '0' })
    await repository.setProvision('u', YEAR, { krankenkasseChf: null })
    expect(updates).toEqual([{ saeule3aChf: '0' }, { krankenkasseChf: null }])
  })
})
