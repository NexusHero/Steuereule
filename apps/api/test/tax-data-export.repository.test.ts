// Art. 15/20: the export must read every table the Art. 17 erasure deletes — the two
// lists drifting apart is exactly how "taxData: []" survived while data existed.
import { describe, expect, it } from 'vitest'
import { PERSONAL_DATA_REGISTRY } from '../src/personal-data/personal-data-registry.js'
import { shadowIdOf } from '../src/common/person-ids.js'
import { EXPORT_SECTIONS, PrismaTaxDataExportRepository, toExportEntry } from '../src/account/tax-data-export.repository.prisma.js'

describe('PrismaTaxDataExportRepository', () => {
  it('reads every table the registry exports as rows, over the own id and every Person B shadow id (API-2)', async () => {
    const read = new Map<string, unknown>()
    const prisma = new Proxy(
      {},
      {
        get: (_target, model) => ({
          findMany: async (args: { where: unknown }) => {
            read.set(String(model), args.where)
            return []
          },
        }),
      },
    )
    await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('user-1')

    const exported = PERSONAL_DATA_REGISTRY.filter((entry) => entry.export.kind === 'rows').map((entry) => entry.model.charAt(0).toLowerCase() + entry.model.slice(1))
    for (const model of [...exported, 'taxYearLink', 'partnerLink', 'householdPerson', 'householdMergeCandidate']) expect(read.has(model), model).toBe(true)
    expect(read.has('unlock')).toBe(true)
    const lstbWhere = read.get('lstb') as { userId: { in: string[] } }
    expect(lstbWhere.userId.in).toContain('user-1')
    expect(lstbWhere.userId.in).toContain(shadowIdOf('user-1', 2025))
  })

  it('marks a row kept for Person B under a shadow id', async () => {
    const rows: Record<string, unknown[]> = { lstb: [{ id: 'l', userId: shadowIdOf('u', 2025), taxYear: 2025, bruttoarbeitslohn: '30000' }] }
    const prisma = new Proxy({}, { get: (_t, model) => ({ findMany: async () => rows[String(model)] ?? [] }) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('u')
    expect(entries.map((entry) => entry.area)).toEqual(['Lohnsteuerbescheinigung (Person B)'])
  })

  it('orders by tax year with yearless Belege last, then by area', async () => {
    const rows: Record<string, unknown[]> = {
      receipt: [{ id: 'b', userId: 'u', taxYear: null, dateiname: 'quittung.pdf' }],
      capital: [{ id: 'k', userId: 'u', taxYear: 2025, kapitalertraege: '1200' }],
      lstb: [{ id: 'l', userId: 'u', taxYear: 2024, bruttoarbeitslohn: '42000' }],
    }
    const prisma = new Proxy({}, { get: (_t, model) => ({ findMany: async () => rows[String(model)] ?? [] }) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('u')
    expect(entries.map((entry) => [entry.area, entry.taxYear])).toEqual([
      ['Lohnsteuerbescheinigung', 2024],
      ['Kapitalerträge', 2025],
      ['Beleg', null],
    ])
  })
})

describe('the export sections come from the registry', () => {
  it('every model the registry exports in a section is one that section shows, and the section shows no other', () => {
    const declared = new Map<string, string[]>()
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.export.kind === 'section') declared.set(entry.export.section, [...(declared.get(entry.export.section) ?? []), entry.model])
    }
    const shown = Object.fromEntries(Object.entries(EXPORT_SECTIONS).map(([section, spec]) => [section, [...spec.models].sort()]))
    expect(Object.fromEntries([...declared].map(([section, models]) => [section, models.sort()]))).toEqual(shown)
  })

  it('reads the account data over the own id and every Person B shadow id', async () => {
    const wheres = new Map<string, unknown>()
    const delegate = (model: string) => ({
      findMany: async (args: { where: unknown }) => {
        wheres.set(model, args.where)
        return []
      },
      findUnique: async () => null,
      count: async (args: { where: unknown }) => {
        wheres.set(model, args.where)
        return 0
      },
    })
    const prisma = new Proxy({}, { get: (_t, model) => delegate(String(model)) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAccountDataForUser('user-1')
    expect(entries.map((entry) => entry.area)).toEqual(['Zwei-Faktor-Anmeldung'])
    for (const model of ['session', 'twoFactor', 'passkey', 'deviceCode', 'oauthClient', 'oauthConsent', 'oauthAccessToken', 'oauthRefreshToken', 'legalHold']) {
      expect((wheres.get(model) as { userId: { in: string[] } } | undefined)?.userId.in, model).toContain(shadowIdOf('user-1', 2025))
    }
  })
})

describe('toExportEntry', () => {
  it('drops technical keys, keeps the person’s figures, and serialises dates', () => {
    const entry = toExportEntry('Kapitalerträge', 'Capital', {
      id: 'row-1',
      userId: 'user-1',
      taxYear: 2025,
      kapitalertraege: '1200',
      updatedAt: new Date('2026-02-01T09:30:00.000Z'),
    })
    expect(entry).toEqual({
      area: 'Kapitalerträge',
      taxYear: 2025,
      fields: { kapitalertraege: '1200', updatedAt: '2026-02-01T09:30:00.000Z' },
    })
  })

  it('never exports a live partner invitation code: whoever holds the file could join the year with it', () => {
    const entry = toExportEntry('Steuerjahr-Kopplung', 'TaxYearLink', {
      id: 'k1', personAUserId: 'a', personBUserId: 'spouse_a_2025', taxYear: 2025, filingType: 'zusammen',
      invitationCode: '9F3A0C71B2E4D658', invitationCodeValidUntil: new Date('2026-03-01T00:00:00.000Z'),
    })
    expect(JSON.stringify(entry)).not.toContain('9F3A0C71B2E4D658')
  })

  it('names each figure by its database column, so the download keeps its German keys', () => {
    const entry = toExportEntry('Kind', 'Child', { id: 'c', userId: 'u', taxYear: 2025, firstName: 'Mia', lastName: 'Beispiel' })
    expect(entry.fields).toEqual({ vorname: 'Mia', nachname: 'Beispiel' })
  })

  it('exports ReceiptFile metadata while stripping binary cipherBytes, iv, authTag, and keyVersion', () => {
    const entry = toExportEntry('Beleg-Datei', 'ReceiptFile', {
      id: 'rf-1',
      receiptId: 'rec-1',
      userId: 'u',
      mimeType: 'application/pdf',
      byteLength: 4096,
      sha256: 'abc123',
      iv: Buffer.from([1, 2, 3]),
      authTag: Buffer.from([4, 5, 6]),
      cipherBytes: Buffer.from([7, 8, 9]),
      keyVersion: 1,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    })
    expect(entry).toEqual({
      area: 'Beleg-Datei',
      taxYear: null,
      fields: {
        mimeType: 'application/pdf',
        dateigroesse: 4096,
        sha256: 'abc123',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
    })
  })
})
