// REQ-015 as amended by ADR-0101: the Gewerbe-Gate is enforced server-side behind SELBSTSTAENDIGE_ENABLED.
// Off (default): exactly the REQ-015 behaviour. On: the self-employed walk on, the gate is unreachable.
import { afterEach, describe, expect, it } from 'vitest'
import { GATE_ACKNOWLEDGED } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { InterviewService, UnreachableAnswerError } from '../src/interview/interview.service.js'
import { selfEmploymentEnabled } from '../src/config/self-employment.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

function setup() {
  const repository = new FakeInterviewAnswerRepository()
  return { repository, service: new InterviewService(repository, new AuditService(new FakeAuditRepository())) }
}

describe('REQ-034 — the self-employment switch on the interview (the Gewerbe-Gate as amended, ADR-0101 §20)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it.each([[undefined, false], ['', false], ['false', false], ['nein', false], ['true', true], ['1', true], ['ON', true]])('SELBSTSTAENDIGE_ENABLED=%s → %s', (raw, expected) => {
    expect(selfEmploymentEnabled(raw === undefined ? {} : { SELBSTSTAENDIGE_ENABLED: raw })).toBe(expected)
  })

  it('off: Selbstständig ends at the gate, as before', async () => {
    delete process.env.SELBSTSTAENDIGE_ENABLED
    const { service } = setup()
    const after = await service.postAnswer('u', 2026, { questionId: 'job', value: 'Selbstständig' })
    expect(after).toEqual({ nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 })
    await expect(service.postAnswer('u', 2026, { questionId: 'ausland', value: 'Nein' })).rejects.toBeInstanceOf(UnreachableAnswerError)
  })

  it('on: Selbstständig goes on to „ausland“; the gate cannot be answered', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const { service } = setup()
    const after = await service.postAnswer('u', 2026, { questionId: 'job', value: 'Selbstständig' })
    expect(after).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 3 })
    await expect(service.postAnswer('u', 2026, { questionId: 'gewerbe', value: GATE_ACKNOWLEDGED })).rejects.toBeInstanceOf(UnreachableAnswerError)
    await expect(service.postAnswer('u', 2026, { questionId: 'ausland', value: 'Nein' })).resolves.toMatchObject({ nextStep: { kind: 'question', id: 'kinder' } })
  })
})
