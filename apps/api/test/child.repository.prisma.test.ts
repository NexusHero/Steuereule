// Regression (#452): since the English-naming refactor (#423) PrismaChildRepository.update wrote
// the DATABASE column names (vorname, idnr, …) instead of the Prisma field names, so every
// PUT /kinder/:id answered 500. This pins the keys against the Prisma model itself.
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { PrismaChildRepository } from '../src/children/child.repository.prisma.js'

describe('PrismaChildRepository.update', () => {
  it('writes only fields the Prisma Child model actually has', async () => {
    let written: Record<string, unknown> = {}
    const row = {
      id: 'k1', userId: 'u', taxYear: 2026, sequenceNumber: 1, firstName: 'Mila', lastName: 'Weber', geburtsdatum: '2019-05-12',
      taxId: null, childBenefitClaimEur: null, kinship: null, kinshipB: null, familyBenefitsOffice: null, domesticResidenceAllYear: null,
      otherParent: null, otherParentName: null, otherParentBirthDate: null, otherParentAddress: null, otherParentKind: null, otherParentDiedOn: null,
      registeredWithMeAllYear: null, childBenefitToMeAllYear: null, healthBasicEur: null, careEur: null, swissFamilyAllowanceEur: null,
    }
    const prisma = {
      child: {
        findFirst: async () => row,
        update: (args: { data: Record<string, unknown> }) => {
          written = args.data
          return Promise.resolve(row)
        },
      },
      taxDataAccessLog: { create: () => Promise.resolve({}) },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    }
    await new PrismaChildRepository(prisma as never).update('u', 2026, 'k1', {
      firstName: 'Mila Sophie', lastName: 'Weber', geburtsdatum: '2019-05-12', taxId: '86095742719', childBenefitClaimEur: '3108',
      kinship: '1', kinshipB: '1', familyBenefitsOffice: 'Familienkasse Bayern Süd', domesticResidenceAllYear: true, otherParent: 'lebt',
      otherParentName: 'Muster, Max', otherParentBirthDate: '1984-02-11', otherParentAddress: 'Musterstr. 1', otherParentKind: '1', otherParentDiedOn: null,
      registeredWithMeAllYear: true, childBenefitToMeAllYear: true, healthBasicEur: '400', careEur: '60', swissFamilyAllowanceEur: '2400',
    })
    const modelFields = new Set(Prisma.dmmf.datamodel.models.find((m) => m.name === 'Child')!.fields.map((f) => f.name))
    const unknown = Object.keys(written).filter((key) => !modelFields.has(key))
    expect(unknown).toEqual([])
    expect(written).toMatchObject({ firstName: 'Mila Sophie', taxId: '86095742719', kinship: '1', swissFamilyAllowanceEur: '2400' })
  })
})
