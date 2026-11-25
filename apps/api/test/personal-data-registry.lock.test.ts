// P7 lock: every Prisma model of both schemas (main and keystore) is in the personal-data registry with its tie to a
// person and its treatment by deletion, export, takeover and legal holds — or marked "no personal data" with a
// reason. A new model nobody declared goes red here instead of outliving an erasure, missing from the export
// or staying behind at the guest's first sign-in.
import { Prisma } from '@prisma/client'
import { Prisma as KeystorePrisma } from '@prisma-keystore/client'
import { describe, expect, it } from 'vitest'
import { taxDataTables } from '../src/account/delete-account-transaction.prisma.js'
import { genericDeletionEntries, PERSONAL_DATA_REGISTRY } from '../src/personal-data/personal-data-registry.js'
import { ownerOf, personIds, shadowIdOf } from '../src/common/shadow-id.js'

const models = [
  ...Prisma.dmmf.datamodel.models.map((model) => model.name),
  ...KeystorePrisma.dmmf.datamodel.models.map((model) => `keystore.${model.name}`),
]
const byModel = new Map(PERSONAL_DATA_REGISTRY.map((entry) => [entry.model, entry]))
const fieldsOf = (name: string) => Prisma.dmmf.datamodel.models.find((model) => model.name === name)?.fields.map((field) => field.name) ?? []

describe('the personal-data registry covers every model', () => {
  it.each(models)('%s is declared', (model) => {
    const entry = byModel.get(model)
    expect(entry, `${model} is missing from PERSONAL_DATA_REGISTRY (apps/api/src/personal-data/personal-data-registry.ts)`).toBeDefined()
    if (!entry!.personalData) {
      // "No personal data" needs a reason in every column.
      for (const treatment of [entry!.deletion, entry!.export, entry!.takeover]) {
        expect('reason' in treatment || treatment.kind === 'cascade').toBe(true)
      }
    } else {
      expect(entry!.tie).not.toBe('none')
    }
  })

  it('declares no model twice and none that does not exist', () => {
    const declared = PERSONAL_DATA_REGISTRY.map((entry) => entry.model)
    expect(new Set(declared).size).toBe(declared.length)
    expect(declared.filter((model) => !models.includes(model))).toEqual([])
  })

  it('every model with a userId column is tied by userId', () => {
    for (const model of Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'userId'))) {
      expect(['userId', 'optionalUserId'], model.name).toContain(byModel.get(model.name)!.tie)
    }
  })

  it('a generic row deletion or export only names models that have a userId column', () => {
    for (const entry of PERSONAL_DATA_REGISTRY.filter((e) => e.deletion.kind === 'rows' || e.deletion.kind === 'rowsUnlessHeld' || e.export.kind === 'rows')) {
      expect(fieldsOf(entry.model), entry.model).toContain('userId')
    }
  })

  it('a row hold names its LegalHold resource; moveYears needs a taxYear column', () => {
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.hold === 'row') expect(entry.holdResource, entry.model).toBeTruthy()
      if (entry.takeover.kind === 'moveYears') expect(fieldsOf(entry.model), entry.model).toContain('taxYear')
    }
  })

  it('a cascade names a real parent with an onDelete: Cascade relation', () => {
    for (const entry of PERSONAL_DATA_REGISTRY.filter((e) => e.deletion.kind === 'cascade')) {
      const parent = (entry.deletion as { from: string }).from
      const relation = Prisma.dmmf.datamodel.models
        .find((model) => model.name === entry.model)!
        .fields.find((field) => field.type === parent && field.relationOnDelete === 'Cascade')
      expect(relation, `${entry.model} → ${parent}`).toBeDefined()
    }
  })

  it('the deletion reads its tables from the registry, children before parents', () => {
    const tables = taxDataTables(new Proxy({}, { get: (_t, key) => String(key) }) as never).map(String)
    expect(tables).toEqual(genericDeletionEntries().map((entry) => entry.model.charAt(0).toLowerCase() + entry.model.slice(1)))
    expect(tables.indexOf('journalLine')).toBeLessThan(tables.indexOf('journalEntry'))
    expect(tables.indexOf('advisorChatMessage')).toBeLessThan(tables.indexOf('advisorConversation'))
    expect(tables.indexOf('receiptFile')).toBeLessThan(tables.indexOf('receipt'))
    expect(tables.indexOf('ledger')).toBeLessThan(tables.indexOf('businessProfile'))
  })

  it('control proof: a paid unlock is held by row, not cascaded with the account', () => {
    expect(byModel.get('Unlock')).toMatchObject({ hold: 'row', holdResource: 'unlock', deletion: { kind: 'rowsUnlessHeld' } })
    expect(byModel.get('FilingVersion')).toMatchObject({ hold: 'row', holdResource: 'filingVersion' })
    const unlockUser = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Unlock')!.fields.find((field) => field.type === 'User')
    expect(unlockUser).toBeUndefined()
  })
})

describe('the person id set', () => {
  it('holds every Person B shadow id of the years a route accepts', () => {
    const ids = personIds('user-1', new Date('2026-06-01T00:00:00Z'))
    expect(ids[0]).toBe('user-1')
    expect(ids).toContain(shadowIdOf('user-1', 2000))
    expect(ids).toContain(shadowIdOf('user-1', 2027))
    expect(ids).not.toContain(shadowIdOf('user-1', 2028))
    expect(personIds(shadowIdOf('user-1', 2025))).toEqual([shadowIdOf('user-1', 2025)])
  })

  it('knows the account a shadow id belongs to', () => {
    expect(ownerOf(shadowIdOf('abc-123', 2025))).toBe('abc-123')
    expect(ownerOf('abc-123')).toBe('abc-123')
  })
})
