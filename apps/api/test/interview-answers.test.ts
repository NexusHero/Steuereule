import { describe, expect, it } from 'vitest'
import { answersFrom } from '../src/interview/answers.js'
import { interviewFieldAccess } from '../src/interview/interview-field-access.js'

describe('answersFrom (#346)', () => {
  it('keeps a stored __proto__ key as an own key instead of dropping it', () => {
    const answers = answersFrom([{ questionId: '__proto__', value: 'x' }, { questionId: 'job', value: 'Angestellt' }])
    expect(Object.keys(answers)).toEqual(['__proto__', 'job'])
    expect(Object.getOwnPropertyDescriptor(answers, '__proto__')?.value).toBe('x')
  })

  it('does not touch any prototype, whatever the key', () => {
    const answers = answersFrom([{ questionId: '__proto__', value: 'x' }, { questionId: 'constructor', value: 'y' }])
    expect(Object.getPrototypeOf(answers)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['x']).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'constructor')?.value).toBe(Object)
    expect(Object.keys(answers)).toContain('constructor')
  })

  it('the last row of a key wins, as before', () => {
    expect(answersFrom([{ questionId: 'job', value: 'a' }, { questionId: 'job', value: 'b' }])).toEqual({ job: 'b' })
  })
})

describe('interviewFieldAccess.read (#346)', () => {
  it('keeps a __proto__ key as an own key too', async () => {
    const repository = { findAllForUserAndYear: async () => [{ questionId: '__proto__', value: 'x' }] }
    const read = (await interviewFieldAccess(repository as never).read('u', 2025, null as never)) ?? {}
    expect(Object.keys(read)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype)
  })
})
