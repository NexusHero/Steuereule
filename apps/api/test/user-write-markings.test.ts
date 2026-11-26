import { describe, expect, it } from 'vitest'
import { provenanceKey } from '@steuereule/core'
import { inProcessKeyedLock, type KeyedLock } from '../src/common/keyed-lock.js'
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
    const markings = new UserWriteMarkings(markingsFailingOnSettle() as ProvenanceRepository, access, inProcessKeyedLock())
    const refused = new Error('LSTB_PLAUSIBILITY_CONFLICT')
    await expect(markings.around(USER, YEAR, ['rente'], () => Promise.reject(refused))).rejects.toBe(refused)
  })

  it('reports a settling failure after a write that went through', async () => {
    const markings = new UserWriteMarkings(markingsFailingOnSettle() as ProvenanceRepository, access, inProcessKeyedLock())
    await expect(markings.around(USER, YEAR, ['rente'], async () => 'saved')).rejects.toThrow('marking store unavailable')
  })

  it('takes the snapshot, runs the write and settles inside one lock of the account', async () => {
    const steps: string[] = []
    let held: string | undefined
    const locks: KeyedLock = {
      withLock: async (key, work) => {
        held = key
        try {
          return await work()
        } finally {
          held = undefined
        }
      },
    }
    const store: Pick<ProvenanceRepository, 'listForUserAndYears' | 'remove'> = {
      listForUserAndYears: async () => {
        steps.push(`list under ${held}`)
        return [marking]
      },
      remove: async () => {
        steps.push(`remove under ${held}`)
        return 1
      },
    }
    let value = '100'
    const changing = { rente: { read: async () => ({ grossPensionEur: value }) } } as unknown as FieldAccess
    const markings = new UserWriteMarkings(store as ProvenanceRepository, changing, locks)

    await markings.around(USER, YEAR, ['rente'], async () => {
      steps.push(`write under ${held}`)
      value = '120'
    })
    expect(steps).toEqual([`list under user-write:${USER}`, `write under user-write:${USER}`, `list under user-write:${USER}`, `remove under user-write:${USER}`])
  })
})
