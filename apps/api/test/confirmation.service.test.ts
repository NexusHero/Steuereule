// Fast, no-DB unit tier (ADR-0004): BestaetigungService against the fake repositories. The
// real-Postgres proofs live in test/acceptance/req-032-herkunft-bestaetigung.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { AuditService } from '../src/audit/audit.service.js'

const USER = 'user-1'
const YEAR = 2025
const CLAUDE = { kind: 'assistent', name: 'Claude' } as const

describe('BestaetigungService', () => {
  let markings: FakeMarkingRepository
  let lstb: FakeLstbRepository
  let pension: FakePensionRepository
  let rental: FakeRentalRepository
  let profile: FakeProfileRepository
  let masterData: FakeMasterDataRepository
  let link: FakeLinkRepository
  let interview: FakeInterviewAnswerRepository
  let chSalary: FakeChSalaryCertificateRepository
  let child: FakeChildRepository
  let service: ConfirmationService

  beforeEach(() => {
    markings = new FakeMarkingRepository()
    lstb = new FakeLstbRepository()
    pension = new FakePensionRepository()
    rental = new FakeRentalRepository()
    profile = new FakeProfileRepository()
    masterData = new FakeMasterDataRepository()
    link = new FakeLinkRepository()
    interview = new FakeInterviewAnswerRepository()
    chSalary = new FakeChSalaryCertificateRepository()
    child = new FakeChildRepository()

    const access = fieldAccessFrom({
      lstb,
      pension,
      capital: new FakeCapitalRepository(),
      rental,
      profile,
      masterData,
      link,
      interview,
      chSalaryCertificate: chSalary,
      child,
    })
    service = new ConfirmationService(markings, access, new AuditService(new FakeAuditRepository()))
  })

  it('a non-user write into an empty field writes the value and leaves it unconfirmed', async () => {
    expect(await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '50000', CLAUDE)).toBe('geschrieben')
    expect((await lstb.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('50000')
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN'])
  })

  it('der Nutzer gewinnt: a typed value stays, the new one becomes a proposal', async () => {
    await lstb.setField(USER, YEAR, 'bruttoarbeitslohn', '4750')

    expect(await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)).toBe('vorschlag')

    expect((await lstb.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('4750')
    expect(await service.missing(USER, YEAR)).toEqual([])
    const overview = await service.overview(USER, YEAR)
    expect(overview.annexes).toEqual([
      {
        annex: 'anlageN',
        unconfirmed: 0,
        values: [
          {
            key: 'lstb.bruttoarbeitslohn',
            screen: 'lstb',
            instance: null,
            field: 'bruttoarbeitslohn',
            value: '4750',
            provenance: { kind: 'nutzer' },
            confirmed: true,
            proposal: { value: '4800', provenance: { kind: 'assistent', name: 'Claude' } },
          },
        ],
      },
    ])
  })

  it('confirming an Anlage lifts its block and only its block', async () => {
    await service.write(USER, YEAR, 'lstb.lohnsteuer', '700', CLAUDE)
    await service.write(USER, YEAR, 'rente.jahresbetrag', '12000', { kind: 'uebernahme', lastYear: 2024 })
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageR'])

    await service.confirmAnnex(USER, YEAR, 'anlageR')

    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN'])
    expect((await service.overview(USER, YEAR)).annexes.map((a) => a.annex)).toEqual(['anlageN'])
  })

  it('accepting a proposal writes it into the mask as confirmed; discarding leaves the user value without a marker', async () => {
    await lstb.setField(USER, YEAR, 'bruttoarbeitslohn', '4750')
    await lstb.setField(USER, YEAR, 'lohnsteuer', '700')
    await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)
    await service.write(USER, YEAR, 'lstb.lohnsteuer', '720', CLAUDE)

    await service.decideProposal(USER, YEAR, 'lstb.bruttoarbeitslohn', 'annehmen')
    await service.decideProposal(USER, YEAR, 'lstb.lohnsteuer', 'verwerfen')

    expect(await lstb.findForUserAndYear(USER, YEAR)).toMatchObject({ bruttoarbeitslohn: '4800', lohnsteuer: '700' })
    expect(markings.all()).toEqual([
      { userId: USER, taxYear: YEAR, key: 'lstb.bruttoarbeitslohn', provenance: CLAUDE, confirmed: true, proposal: null },
    ])
    expect(await service.missing(USER, YEAR)).toEqual([])
  })

  it('a proposal decision on a field without a proposal is a 404, an unknown key a 400', async () => {
    await expect(service.decideProposal(USER, YEAR, 'lstb.lohnsteuer', 'annehmen')).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' })
    await expect(service.decideProposal(USER, YEAR, 'gewerbe.gewinn', 'annehmen')).rejects.toMatchObject({ code: 'FIELD_UNKNOWN' })
  })

  it('an unknown Anlage is a 400, never a silent no-op', async () => {
    await expect(service.confirmAnnex(USER, YEAR, 'anlageX' as never)).rejects.toMatchObject({ code: 'ANLAGE_UNKNOWN' })
  })

  it('writes into a Vermietungsobjekt by instance and refuses an object of another user', async () => {
    const own = await rental.create(USER, YEAR)
    const fremdes = await rental.create('user-2', YEAR)

    await service.write(USER, YEAR, `vermietung:${own.id}.mieteinnahmen`, '9000', CLAUDE)
    await expect(service.write(USER, YEAR, `vermietung:${fremdes.id}.mieteinnahmen`, '1', CLAUDE)).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' })

    expect((await rental.listForUserAndYear('user-2', YEAR))[0]?.mieteinnahmen).toBeNull()
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageV'])
  })

  it('the overview is scoped to the caller', async () => {
    await service.write('user-2', YEAR, 'lstb.lohnsteuer', '700', CLAUDE)
    expect(await service.overview(USER, YEAR)).toEqual({ annexes: [] })
    expect(await service.missing(USER, YEAR)).toEqual([])
  })

  it('supports writes to all remaining screens (profil, stammdaten, kopplung, interview, chLohnausweis, kind)', async () => {
    // 1. profil
    expect(await service.write(USER, YEAR, 'profil.firstName', 'Lena', CLAUDE)).toBe('geschrieben')
    expect((await profile.findByUserId(USER))?.firstName).toBe('Lena')

    // 2. stammdaten
    expect(await service.write(USER, YEAR, 'stammdaten.beruf', 'Software Engineer', CLAUDE)).toBe('geschrieben')
    expect((await masterData.findByUserId(USER))?.beruf).toBe('Software Engineer')

    // 3. kopplung
    expect(await service.write(USER, YEAR, 'kopplung.filingType', 'zusammen', CLAUDE)).toBe('geschrieben')
    expect((await link.findByUserAndYear(USER, YEAR))?.filingType).toBe('zusammen')

    // 4. interview
    expect(await service.write(USER, YEAR, 'interview.job', 'Angestellt', CLAUDE)).toBe('geschrieben')
    const answers = await interview.findAllForUserAndYear(USER, YEAR)
    expect(answers.find((a) => a.questionId === 'job')?.value).toBe('Angestellt')

    // 5. chLohnausweis
    expect(await service.write(USER, YEAR, 'chLohnausweis.bruttolohn-total', '120000', CLAUDE)).toBe('geschrieben')
    expect(await service.write(USER, YEAR, 'chLohnausweis.arbeitgeberName', 'Rheinpharma AG', CLAUDE)).toBe('geschrieben')
    const cert = await chSalary.findForUserAndYear(USER, YEAR)
    expect(cert?.fields['bruttolohn-total']).toBe('120000')
    expect(cert?.nGre.arbeitgeberName).toBe('Rheinpharma AG')

    // 6. kind (with instance)
    const newChild = await child.create(USER, YEAR, { firstName: 'Noah', lastName: 'Brenner', geburtsdatum: '2020-01-01' })
    expect(await service.write(USER, YEAR, `kind:${newChild.id}.kinship`, '1', CLAUDE)).toBe('geschrieben')
    const kids = await child.listForUserAndYear(USER, YEAR)
    expect(kids[0]?.kinship).toBe('1')
  })
})
