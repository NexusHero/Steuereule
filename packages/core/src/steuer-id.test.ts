import { describe, expect, it } from 'vitest'
import { isValidSteuerId, isValidSteuernummer } from './steuer-id'

// Boundary table for the shape rules the Onboarding PUT /v1/profile endpoint enforces
// server-side. This table is the single source of truth the frontend formatter (#27)
// and the backend DTO validator (#29) both trace to — it must never be duplicated.
describe('isValidSteuerId', () => {
  it('rejects an empty string', () => {
    expect(isValidSteuerId('')).toBe(false)
  })

  it('rejects 10 digits (one short)', () => {
    expect(isValidSteuerId('1234567890')).toBe(false)
  })

  it('rejects 12 digits (one too many)', () => {
    expect(isValidSteuerId('123456789012')).toBe(false)
  })

  it('rejects a non-digit character mixed in', () => {
    expect(isValidSteuerId('1234567890a')).toBe(false)
  })

  it('rejects internal whitespace', () => {
    expect(isValidSteuerId('123 456 789')).toBe(false)
  })

  it('rejects leading whitespace', () => {
    expect(isValidSteuerId(' 12345678901')).toBe(false)
  })

  it('rejects trailing whitespace', () => {
    expect(isValidSteuerId('12345678901 ')).toBe(false)
  })

  it('accepts exactly 11 digits', () => {
    expect(isValidSteuerId('12345678901')).toBe(true)
  })
})

describe('isValidSteuernummer', () => {
  it('accepts undefined (field is optional)', () => {
    expect(isValidSteuernummer(undefined)).toBe(true)
  })

  it('accepts null (field is optional)', () => {
    expect(isValidSteuernummer(null)).toBe(true)
  })

  it('rejects an empty string (present but empty is not a valid value)', () => {
    expect(isValidSteuernummer('')).toBe(false)
  })

  it('rejects 14 digits (one too many)', () => {
    expect(isValidSteuernummer('12345678901234')).toBe(false)
  })

  it('rejects a non-digit character mixed in', () => {
    expect(isValidSteuernummer('123456789012a')).toBe(false)
  })

  it('rejects internal whitespace', () => {
    expect(isValidSteuernummer('123 456')).toBe(false)
  })

  it('accepts 1 digit (lower bound)', () => {
    expect(isValidSteuernummer('1')).toBe(true)
  })

  it('accepts 13 digits (upper bound)', () => {
    expect(isValidSteuernummer('1234567890123')).toBe(true)
  })
})
