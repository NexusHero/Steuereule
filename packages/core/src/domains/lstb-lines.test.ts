import { describe, expect, it } from 'vitest'
import { lstbSocialSecurityFromLines, lstbSubsidyQuestionOpen } from './lstb'

describe('LStB Zeilen 22–27 as a block', () => {
  it('adds the four employee lines once all of them are recorded', () => {
    expect(lstbSocialSecurityFromLines({ rvArbeitnehmer: 6000, kvArbeitnehmer: 3000, pvArbeitnehmer: 600, avArbeitnehmer: 700 })).toBe(10300)
  })

  it('gives no sum while a line is missing, and counts an explicit 0', () => {
    expect(lstbSocialSecurityFromLines({ rvArbeitnehmer: 6000, kvArbeitnehmer: 3000, pvArbeitnehmer: 600 })).toBeNull()
    expect(lstbSocialSecurityFromLines({ rvArbeitnehmer: 6000, kvArbeitnehmer: 0, pvArbeitnehmer: 0, avArbeitnehmer: 700 })).toBe(6700)
  })

  it('leaves the employer line out of the sum', () => {
    expect(lstbSocialSecurityFromLines({ rvArbeitgeber: 6000, rvArbeitnehmer: 6000, kvArbeitnehmer: 1, pvArbeitnehmer: 1, avArbeitnehmer: 1 })).toBe(6003)
  })

  it('asks for Zeile 24 once Zeile 25 or 26 is filled', () => {
    expect(lstbSubsidyQuestionOpen({ kvArbeitnehmer: 3000 })).toBe(true)
    expect(lstbSubsidyQuestionOpen({ pvArbeitnehmer: 600, zuschuesseKvPv: null })).toBe(true)
    expect(lstbSubsidyQuestionOpen({ kvArbeitnehmer: 3000, zuschuesseKvPv: 0 })).toBe(false)
    expect(lstbSubsidyQuestionOpen({ kvArbeitnehmer: 3000, zuschuesseKvPv: 1500 })).toBe(false)
    expect(lstbSubsidyQuestionOpen({ kvArbeitnehmer: 0, pvArbeitnehmer: 0 })).toBe(false)
    expect(lstbSubsidyQuestionOpen({})).toBe(false)
  })
})
