import { beforeEach, describe, expect, it } from 'vitest'
import { AMOUNT_LATER } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { InterviewService } from '../src/interview/interview.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

const USER_ID = 'user-1'
const TAX_YEAR = 2025

describe('InterviewService — Slice 5 haushalt & gesundheit entries', () => {
  let repository: FakeInterviewAnswerRepository
  let service: InterviewService

  beforeEach(() => {
    repository = new FakeInterviewAnswerRepository()
    service = new InterviewService(repository, new AuditService(new FakeAuditRepository()))
  })

  it('persists and reads haushalt catalogue answers including AMOUNT_LATER', async () => {
    const initial = await service.getState(USER_ID, TAX_YEAR, 'haushalt')
    expect(initial.nextStep).toEqual({ kind: 'question', id: 'haushalt-gate' })

    await service.postAnswer(USER_ID, TAX_YEAR, { questionId: 'haushalt-gate', value: 'Ja' })
    const s2 = await service.postAnswer(USER_ID, TAX_YEAR, {
      questionId: 'haushalt-dienstleistung-betrag',
      value: '1500',
    })
    expect(s2.nextStep).toEqual({ kind: 'question', id: 'haushalt-handwerker-betrag' })

    await service.postAnswer(USER_ID, TAX_YEAR, {
      questionId: 'haushalt-handwerker-betrag',
      value: AMOUNT_LATER,
    })
    const done = await service.postAnswer(USER_ID, TAX_YEAR, {
      questionId: 'haushalt-minijob-betrag',
      value: '500',
    })
    expect(done.nextStep).toEqual({ kind: 'done' })

    const reloaded = await service.getState(USER_ID, TAX_YEAR, 'haushalt')
    expect(reloaded.nextStep).toEqual({ kind: 'done' })
    expect(reloaded.answers['haushalt-handwerker-betrag']).toBe(AMOUNT_LATER)
  })

  it('persists and reads gesundheit catalogue answers', async () => {
    const initial = await service.getState(USER_ID, TAX_YEAR, 'gesundheit')
    expect(initial.nextStep).toEqual({ kind: 'question', id: 'gesundheit-gate' })

    await service.postAnswer(USER_ID, TAX_YEAR, { questionId: 'gesundheit-gate', value: 'Ja' })
    const done = await service.postAnswer(USER_ID, TAX_YEAR, {
      questionId: 'gesundheit-betrag',
      value: '4200',
    })
    expect(done.nextStep).toEqual({ kind: 'done' })

    const reloaded = await service.getState(USER_ID, TAX_YEAR, 'gesundheit')
    expect(reloaded.answers['gesundheit-betrag']).toBe('4200')
  })
})
