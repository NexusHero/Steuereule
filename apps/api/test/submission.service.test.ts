// Fast, no-DB tier (ADR-0004): the Abgabe (ADR-0098 §8) against fakes. The user prints the forms, files
// them himself and says so in the cockpit; the version frozen then is what the Bescheid-Abgleich compares.
import { describe, expect, it } from 'vitest'
import type { CommuteInputs } from '../src/commute/commute.repository.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../src/common/domain-error.js'
import { SubmissionService } from '../src/submission/submission.service.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import type { YearHistoryRepository } from '../src/year-history/year-history.repository.js'
import { YearHistoryService } from '../src/year-history/year-history.service.js'
import { emptyYearHistoryInsights } from './fakes/year-history-insights.kit.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeFilingVersionRepository } from './fakes/fake-filing-version.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeSubmissionRepository } from './fakes/fake-submission.repository.js'

const USER = 'user-a'
const OTHER = 'user-b'
const YEAR = 2025
const TODAY = '2026-11-18'

const commute = (workEquipmentEur: number): CommuteInputs => ({
  workdays: [1, 2, 3, 4, 5],
  vacationDays: 0,
  sickDays: 0,
  homeOfficeDays: 0,
  oneWayKm: null,
  transport: null,
  workplace: null,
  workEquipmentEur,
})

function setup() {
  const versions = new FakeFilingVersionRepository()
  const audit = new FakeAuditRepository()
  const submissions = new FakeSubmissionRepository(versions, audit)
  const assessments = new FakeAssessmentRepository()
  const lstb = new FakeLstbRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const interview = new FakeInterviewAnswerRepository()
  const link = new FakeLinkRepository()
  const commutes = new FakeCommuteRepository()
  const estimates = new TaxEstimateService(lstb, interview, ch, new FakeMasterDataRepository(), commutes, link)
  const service = new SubmissionService(submissions, versions, assessments, lstb, ch, commutes, interview, link, estimates)

  submissions.seedYear(USER, YEAR)
  lstb.seed({ userId: USER, taxYear: YEAR, bruttoarbeitslohn: '48200', lohnsteuer: '7457', sozialversicherung: '9880' })
  interview.seed(USER, YEAR, { job: 'Angestellt', familienstand: 'Ledig', ausland: 'Nein', kinder: 'Nein' })
  void commutes.save(USER, YEAR, commute(1_400))

  const yearRepo: YearHistoryRepository = {
    yearsOf: async (userId) => ((await submissions.yearStatus(userId, YEAR)) === null ? [] : [{ year: YEAR, status: await submissions.yearStatus(userId, YEAR), hasData: true, filedElsewhere: null }]),
    setFiledElsewhere: async () => undefined,
  }
  const history = new YearHistoryService(yearRepo, assessments, versions, lstb, ch, commutes, interview, link, estimates, emptyYearHistoryInsights(commutes))
  return { service, submissions, versions, assessments, audit, commutes, estimates, history, link, lstb, interview }
}

const bescheid = (assessments: FakeAssessmentRepository, values: Record<string, number>) =>
  Promise.all(Object.entries(values).map(([field, value]) => assessments.setField(USER, YEAR, field as never, String(value))))

describe('SubmissionService.submit', () => {
  it('freezes the return as it stands today, in the positions of the Bescheid-Abgleich', async () => {
    const { service, versions, estimates, audit } = setup()

    const result = await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)

    expect(result).toEqual({ status: 'eingereicht', submittedOn: '2026-03-14', replacedPrevious: false })
    const version = (await versions.findLatest(USER, YEAR))!
    expect(version).toMatchObject({ userId: USER, taxYear: YEAR, number: 1, filingType: 'einzel', submittedOn: '2026-03-14' })
    const estimate = await estimates.getState(USER, YEAR)
    if (estimate.kind !== 'spanne') throw new Error('the fixture must be estimable')
    const mid = (r: { from: number; to: number }) => Math.round((r.from + r.to) / 2)
    expect(version.positions).toMatchObject({
      bruttoarbeitslohnA: 48_200,
      arbeitsmittelA: 1_400,
      werbungskostenA: 1_400,
      zuVersteuerndesEinkommen: mid(estimate.taxableIncome),
      festgesetzteSteuer: mid(estimate.incomeTax),
      anrechnung: 7_457,
      erstattung: mid(estimate.result),
    })
    expect(version.positions.bruttoarbeitslohnB).toBeUndefined()
    expect(version.estimateAtSubmission).toEqual(estimate.result)
    expect(audit.all()).toContainEqual(expect.objectContaining({ userId: USER, action: 'WRITE', resource: 'abgabe' }))
  })

  it('a second submission replaces the version (a corrected return) and says so', async () => {
    const { service, versions, commutes } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    await commutes.save(USER, YEAR, commute(1_900))

    const result = await service.submit(USER, YEAR, { submittedOn: '2026-04-02' }, TODAY)

    expect(result).toEqual({ status: 'eingereicht', submittedOn: '2026-04-02', replacedPrevious: true })
    const version = (await versions.findLatest(USER, YEAR))!
    expect(version.number).toBe(2)
    expect(version.positions.arbeitsmittelA).toBe(1_900)
    expect(await versions.listLatestForUser(USER)).toHaveLength(1)
  })

  it('freezes Person B’s columns in a joint return this account keeps', async () => {
    const { service, versions, link, lstb, interview, commutes } = setup()
    const spouse = `spouse_${USER}_${YEAR}`
    await link.upsert(USER, YEAR, { personBUserId: spouse, filingType: 'zusammen' })
    interview.seed(USER, YEAR, { job: 'Angestellt', familienstand: 'Verheiratet', ausland: 'Nein', kinder: 'Nein', 'partner-job': 'Angestellt' })
    lstb.seed({ userId: spouse, taxYear: YEAR, bruttoarbeitslohn: '41200', lohnsteuer: '4861', sozialversicherung: '8690' })
    await commutes.save(spouse, YEAR, commute(210))

    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)

    const version = (await versions.findLatest(USER, YEAR))!
    expect(version.filingType).toBe('zusammen')
    expect(version.positions).toMatchObject({ bruttoarbeitslohnA: 48_200, bruttoarbeitslohnB: 41_200, arbeitsmittelB: 210, werbungskostenB: 210 })
  })

  it.each([
    ['14.03.2026', 'format'],
    ['2026-02-30', 'format'],
    ['2026-11-19', 'in-der-zukunft'],
    ['2025-12-31', 'vor-jahresende'],
  ])('refuses the date %s (%s) and freezes nothing', async (submittedOn, problem) => {
    const { service, versions } = setup()
    const error = await service.submit(USER, YEAR, { submittedOn }, TODAY).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InvalidInputError)
    expect(error).toMatchObject({ code: 'SUBMISSION_DATE_INVALID', details: { problem } })
    expect(await versions.findLatest(USER, YEAR)).toBeNull()
  })

  it('needs a year the user has started', async () => {
    const { service } = setup()
    await expect(service.submit(USER, 2024, { submittedOn: '2026-03-14' }, TODAY)).rejects.toMatchObject({ code: 'TAX_YEAR_NOT_FOUND' })
    await expect(service.submit(USER, 2024, { submittedOn: '2026-03-14' }, TODAY)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses an Eckjahr: there is nothing filed in the app', async () => {
    const { service, submissions } = setup()
    submissions.seedYear(USER, YEAR, 'extern-erledigt')
    await expect(service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_ALLOWED', details: { status: 'extern-erledigt' } })
  })

  it('refuses once a Bescheid is recorded: the diff must not move under it', async () => {
    const { service, assessments } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    await bescheid(assessments, { erstattung: 400 })
    const error = await service.submit(USER, YEAR, { submittedOn: '2026-04-02' }, TODAY).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error).toMatchObject({ code: 'SUBMISSION_HAS_ASSESSMENT' })
  })
})

describe('SubmissionService.withdraw', () => {
  it('undoes the submission: the version is gone and the year is a draft again', async () => {
    const { service, versions, submissions } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)

    await service.withdraw(USER, YEAR)

    expect(await versions.findLatest(USER, YEAR)).toBeNull()
    expect(await submissions.yearStatus(USER, YEAR)).toBe('entwurf')
    expect(await service.state(USER, YEAR)).toBeNull()
  })

  it('is blocked once a Bescheid is recorded', async () => {
    const { service, assessments, versions } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    await bescheid(assessments, { festgesetzteSteuer: 6_000 })
    const error = await service.withdraw(USER, YEAR).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error).toMatchObject({ code: 'SUBMISSION_HAS_ASSESSMENT' })
    expect(await versions.findLatest(USER, YEAR)).not.toBeNull()
  })

  it('has nothing to undo before a submission, and never another account’s', async () => {
    const { service } = setup()
    await expect(service.withdraw(USER, YEAR)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' })
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    await expect(service.withdraw(OTHER, YEAR)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' })
    expect(await service.state(OTHER, YEAR)).toBeNull()
  })
})

describe('SubmissionService.state (the cockpit)', () => {
  it('is null before, and the date and whether it can still be undone after', async () => {
    const { service, assessments } = setup()
    expect(await service.state(USER, YEAR)).toBeNull()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    expect(await service.state(USER, YEAR)).toEqual({ status: 'eingereicht', submittedOn: '2026-03-14', withdrawable: true })
    await bescheid(assessments, { erstattung: 400 })
    expect(await service.state(USER, YEAR)).toEqual({ status: 'eingereicht', submittedOn: '2026-03-14', withdrawable: false })
  })
})

describe('the Verlauf after the Abgabe (ADR-0098 §1, §8)', () => {
  it('shows the year as submitted and waiting for its Bescheid', async () => {
    const { service, history } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    const verlauf = await history.get(USER, TODAY)
    // The other years of the Festsetzungsfrist are gap years without data (ADR-0099 §1).
    expect(verlauf.list.filter((l) => l.hasData).map((l) => [l.year, l.status, l.kind, l.noDiffReason])).toEqual([[YEAR, 'eingereicht', 'eingereicht', 'kein-bescheid']])
    expect(verlauf.openItems.filter((i) => i.year === YEAR).map((i) => [i.year, i.kind])).toEqual([[YEAR, 'wartet-auf-bescheid']])
  })

  it('diffs the Bescheid against the frozen version, not against answers changed afterwards', async () => {
    const { service, history, versions, assessments, commutes } = setup()
    await service.submit(USER, YEAR, { submittedOn: '2026-03-14' }, TODAY)
    const filed = (await versions.findLatest(USER, YEAR))!.positions
    // After filing, the user raises the Arbeitsmittel; the Finanzamt recognises only 900 of the filed 1.400.
    await commutes.save(USER, YEAR, commute(2_500))
    await bescheid(assessments, { ...filed, arbeitsmittelA: 900, werbungskostenA: 1_230 })
    await assessments.setDate(USER, YEAR, '2026-10-30')

    const verlauf = await history.get(USER, TODAY)

    expect(verlauf.list.find((l) => l.year === YEAR)).toMatchObject({ year: YEAR, kind: 'bescheid', deviations: 1, noDiffReason: null })
    const diff = verlauf.diffs.find((d) => d.year === YEAR)!
    expect(diff.submittedOn).toBe('2026-03-14')
    expect(diff.diff.ownDeviations.map((d) => [d.position, d.declared, d.assessed])).toEqual([['arbeitsmittelA', 1_400, 900]])
  })
})
