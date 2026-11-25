import { describe, expect, it } from 'vitest'
import { provenanceKey } from '@steuereule/core'
import { UserWriteMarkings } from '../src/confirmation/user-write-markings.js'
import type { FieldAccess } from '../src/confirmation/field-access.js'
import type { ProvenanceRecord, ProvenanceRepository } from '../src/marking/marking.repository.js'

const USER = 'user-1'
const YEAR = 2025
const KEY = provenanceKey('rente', 'grossPensionEur')

const marking: ProvenanceRecord = {
  userId: USER,
  taxYear: YEAR,
  key: KEY,
  provenance: { kind: 'assistent', name: 'Claude', clientId: 'client-claude' },
  confirmed: false,
  proposal: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

/** A marking store whose second listing (the one `settle` makes) fails. */
function markingsFailingOnSettle(): Pick<ProvenanceRepository, 'listForUserAndYears' | 'remove'> {
  let listings = 0
  return {
    listForUserAndYears: async () => {
      listings += 1
      if (listings > 1) throw new Error('marking store unavailable')
      return [marking]
    },
    remove: async () => 0,
  }
}

const access = { rente: { read: async () => ({ grossPensionEur: '100' }) } } as unknown as FieldAccess

describe('UserWriteMarkings.around', () => {
  it('answers with the write’s own error when settling fails after a refused write', async () => {
    const markings = new UserWriteMarkings(markingsFailingOnSettle() as ProvenanceRepository, access)
    const refused = new Error('LSTB_PLAUSIBILITY_CONFLICT')
    await expect(markings.around(USER, YEAR, ['rente'], () => Promise.reject(refused))).rejects.toBe(refused)
  })

  it('reports a settling failure after a write that went through', async () => {
    const markings = new UserWriteMarkings(markingsFailingOnSettle() as ProvenanceRepository, access)
    await expect(markings.around(USER, YEAR, ['rente'], async () => 'saved')).rejects.toThrow('marking store unavailable')
  })
})
