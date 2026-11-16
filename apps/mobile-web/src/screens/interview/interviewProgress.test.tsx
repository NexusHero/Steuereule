import { describe, expect, it } from 'vitest'
import { interviewProgress } from './QuestionScreen'

// UX review H4: the count runs on through the partner questions instead of restarting at 0/4.
describe('interviewProgress', () => {
  it('counts the minimal gate as four steps', () => {
    expect(interviewProgress('job', {})).toEqual({ step: 0, total: 4 })
    expect(interviewProgress('familienstand', { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' })).toEqual({ step: 3, total: 4 })
  })

  it('continues with the partner questions as steps 5 and 6 after „Verheiratet“', () => {
    const married = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' }
    expect(interviewProgress('partner-job', married)).toEqual({ step: 4, total: 6 })
    expect(interviewProgress('partner-ausland', { ...married, 'partner-job': 'Angestellt' })).toEqual({ step: 5, total: 6 })
  })

  it('ends at step 5 when the partner is retired or not working', () => {
    const married = { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Rente' }
    expect(interviewProgress('partner-job', married)).toEqual({ step: 4, total: 5 })
  })
})
