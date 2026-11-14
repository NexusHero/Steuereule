// UX review H3 — one data stream: the Familienstand of the interview reaches the master data and a
// „Verheiratet“ sets up the joint return, so the user is not asked a second time.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { InterviewService } from '../src/interview/interview.service.js'
import { LinkService } from '../src/link/link.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'

const YEAR = 2025

function setup() {
  const answers = new FakeInterviewAnswerRepository()
  const links = new FakeLinkRepository()
  const masterData = new FakeMasterDataRepository()
  const audit = new AuditService(new FakeAuditRepository())
  const link = new LinkService(links, new FakeProfileRepository(), masterData, audit)
  const service = new InterviewService(answers, audit, link)
  return { answers, links, masterData, service }
}

async function answerUpToMarried(service: InterviewService, familienstand: string, kind: 'session' | 'guest' = 'session') {
  await service.postAnswer('u', YEAR, { questionId: 'job', value: 'Angestellt' }, kind)
  await service.postAnswer('u', YEAR, { questionId: 'ausland', value: 'Nein' }, kind)
  await service.postAnswer('u', YEAR, { questionId: 'kinder', value: 'Nein' }, kind)
  await service.postAnswer('u', YEAR, { questionId: 'familienstand', value: familienstand }, kind)
}

describe('interview answers reach the household (UX review H3)', () => {
  it('„Verheiratet“ fills the master data and sets up the joint return', async () => {
    const { service, masterData, links } = setup()
    await answerUpToMarried(service, 'Verheiratet')

    expect((await masterData.findByUserId('u'))?.familienstand).toBe('verheiratet')
    expect((await links.findByUserAndYear('u', YEAR))?.filingType).toBe('zusammen')
  })

  it('„Ledig“ fills the master data and creates no joint return', async () => {
    const { service, masterData, links } = setup()
    await answerUpToMarried(service, 'Ledig')

    expect((await masterData.findByUserId('u'))?.familienstand).toBe('ledig')
    expect(await links.findByUserAndYear('u', YEAR)).toBeNull()
  })

  it('never overwrites a Familienstand or Veranlagungsart the user chose', async () => {
    const { service, masterData, links } = setup()
    await masterData.save('u', { ...((await masterData.findByUserId('u')) ?? ({} as never)), familienstand: 'dauernd getrennt' } as never)
    await links.upsert('u', YEAR, { filingType: 'einzel', personBUserId: '', invitationCode: null, invitationCodeValidUntil: null })
    await answerUpToMarried(service, 'Verheiratet')

    expect((await masterData.findByUserId('u'))?.familienstand).toBe('dauernd getrennt')
    expect((await links.findByUserAndYear('u', YEAR))?.filingType).toBe('einzel')
  })

  it('leaves a guest alone and adopts the answers on the first read after the upgrade', async () => {
    const { service, masterData, links } = setup()
    await answerUpToMarried(service, 'Verheiratet', 'guest')
    expect(await masterData.findByUserId('u')).toBeNull()

    await service.getState('u', YEAR)
    expect((await links.findByUserAndYear('u', YEAR))?.filingType).toBe('zusammen')
  })
})
